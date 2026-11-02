<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <link rel="icon" href="{{ asset('images/favicon.jpg') }}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>OptimusOrien</title>

  <script>
    // Sync Laravel State to SPA
    @php
      $user = null;
      $activeGuard = null;
      
      // Explicitly check guards
      if (\Illuminate\Support\Facades\Auth::guard('owner')->check()) {
          $user = \Illuminate\Support\Facades\Auth::guard('owner')->user();
          $activeGuard = 'owner';
      } elseif (\Illuminate\Support\Facades\Auth::guard('web')->check()) {
          $user = \Illuminate\Support\Facades\Auth::guard('web')->user();
          $activeGuard = 'web';
      }
      error_log("Blade Auth Debug - Path: " . request()->path() . " - Active Guard: " . ($activeGuard ?? 'NONE') . " - Session: " . session()->getId());

      $userData = null;
      $userSettings = null;
      if ($user) {
          $resolvedUserType = $activeGuard === 'owner'
              ? 'owner'
              : ($user->portalUserType() ?: ($user->user_type ?? 'staff'));
          $userData = [
              'id' => $user->id,
              'name' => ($activeGuard === 'owner') ? ($user->name ?? 'Owner') : trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
              'email' => $user->email ?? '',
              'role' => $resolvedUserType,
              'user_type' => $resolvedUserType,
              'campus_id' => session('selected_campus_id') ?? ($user->campus_id ?? 'all'),
              'hook_id' => $user->hook_id ?? null,
              'image' => ($activeGuard === 'owner') ? ($user->image ?? null) : ($user->image ? url('/tenants/' . tenant('id') . '/' . ltrim($user->image, '/')) : null),
          ];
          error_log("Blade User Found - Guard: $activeGuard - ID: " . $user->id);
          try {
              $userSettings = \App\Models\SysUserSetting::where('user_id', $user->id)->first();
          } catch (\Exception $e) {
              \Log::error("Failed to load user settings in blade: " . $e->getMessage());
          }
      } else {
          error_log("Blade User NOT Found - Path: " . request()->path());
      }

      $ownerLoginInfo = null;
      if (!$user && (request()->is('owner/login') || request()->routeIs('owner.login'))) {
          $owner = \App\Models\Owner::first();
          if ($owner) {
              $ownerLoginInfo = [
                  'email' => $owner->email,
                  'password' => '12345678' // Default demo password
              ];
          }
      }
      
      $allFonts = [];
      try {
          $allFonts = \App\Models\Font::all();
      } catch (\Exception $e) {
          \Log::error("Failed to load fonts in blade: " . $e->getMessage());
      }
      
      $systemSettings = null;
      try {
          $systemSettings = \App\Models\SystemSetting::first();
      } catch (\Exception $e) {
          \Log::error("Failed to load system settings in blade: " . $e->getMessage());
      }
    @endphp

    @php

        $resolvedLang = null;
        if ($userSettings && !empty($userSettings->lang)) {
            $resolvedLang = $userSettings->lang;
        } elseif ($user && !empty($user->language)) {
            $resolvedLang = $user->language;
        } else {
            $resolvedLang = session('locale', app()->getLocale());
        }

        $tenant = function_exists('tenancy') ? tenancy()->tenant : null;
        $isSubscriptionActive = true;
        $tenantFeatures = [];
        if ($tenant) {
            $isSubscriptionActive = $tenant->isSubscriptionActive();
            try {
                $tenantFeatures = tenant_features();
            } catch (\Exception $e) {
                $tenantFeatures = [];
            }
        }
    @endphp

    @php
      // Build CASL ability rules from Spatie permissions
      $abilityRules = [];
      if ($user && $activeGuard === 'web') {
          try {
              $allPermissions = $user->getAllPermissions()->pluck('name')->toArray();
              
              foreach ($allPermissions as $permission) {
                  if (str_contains($permission, '.')) {
                      // Format: subject.action (e.g., student.view, examination.floors.create)
                      $lastDotPos = strrpos($permission, '.');
                      $subject = substr($permission, 0, $lastDotPos);
                      $action = substr($permission, $lastDotPos + 1);
                      
                      // 1. Map exact original permission
                      $abilityRules[] = [
                          'action' => $action,
                          'subject' => $subject,
                      ];
                      
                      // 2. Map fee.increment_decrement to subject 'fee_increment' and actions 'view'/'create'/'edit'/'delete'
                      if ($subject === 'fee' && $action === 'increment_decrement') {
                          $abilityRules[] = ['action' => 'view', 'subject' => 'fee_increment'];
                          $abilityRules[] = ['action' => 'create', 'subject' => 'fee_increment'];
                          $abilityRules[] = ['action' => 'edit', 'subject' => 'fee_increment'];
                          $abilityRules[] = ['action' => 'delete', 'subject' => 'fee_increment'];
                          continue;
                      }
                      
                      // 3. Normalized / general mappings for CASL compatibility
                      // Any action on a subject implies general view/read access
                      $abilityRules[] = [
                          'action' => 'view',
                          'subject' => $subject,
                      ];
                      
                      // If it's a write action, also map to 'create' and 'edit'
                      if (in_array($action, ['create', 'add', 'store', 'fee_transaction_create', 'add_fee_payment'])) {
                          $abilityRules[] = [
                              'action' => 'create',
                              'subject' => $subject,
                          ];
                      }
                      if (in_array($action, ['update', 'edit', 'status'])) {
                          $abilityRules[] = [
                              'action' => 'edit',
                              'subject' => $subject,
                          ];
                      }
                  } else {
                      // Single-word permissions like access_all_campuses
                      $abilityRules[] = [
                          'action' => 'manage',
                          'subject' => $permission,
                      ];
                  }
              }
          } catch (\Exception $e) {
              \Log::error("Failed to load user permissions in blade: " . $e->getMessage());
          }
          
          // Every authenticated user gets minimal dashboard access so they can land on /home
          $abilityRules[] = [
              'action' => 'view',
              'subject' => 'dashboard',
          ];

          // Deduplicate the mapped rules to keep cookie size optimized
          if (!empty($abilityRules)) {
              $abilityRules = array_values(array_unique($abilityRules, SORT_REGULAR));
          }


      } elseif ($user && $activeGuard === 'owner') {
          // Owner gets full access
          $abilityRules = [['action' => 'manage', 'subject' => 'all']];
      }
    @endphp
    window.config = {
        user: @json($userData),
       ownerLogin: @json($ownerLoginInfo),
        lang: '{{ $resolvedLang }}',
        rtl: {{ in_array($resolvedLang, ['ur', 'ar']) ? 'true' : 'false' }},
        user_settings: @json($userSettings),
        system_settings: @json($systemSettings),
        logo_url: '{{ $tenant ? url("/tenants/" . tenant("id") . "/" . ltrim("business_logos/" . ($systemSettings->org_logo ?? session()->get("system_details.org_logo") ?? ""), "/")) : "" }}',
        tenant: {
            id: '{{ $tenant->id ?? '' }}',
            is_active: {{ $isSubscriptionActive ? 'true' : 'false' }},
            features: @json($tenantFeatures)
        }
    };
    window.__pageFonts = @json($allFonts);


    // Helper to set cookies and localStorage for large datasets
    const setCookie = (name, value) => {
        const stringified = typeof value === 'string' ? value : JSON.stringify(value);
        document.cookie = name +'='+ encodeURIComponent(stringified) +'; path=/; max-age=604800;';
        try {
            localStorage.setItem(name, stringified);
        } catch (e) {
            console.error('Failed to write to localStorage:', e);
        }
    }

    const setConfigCookie = (key, value) => {
        document.cookie = `Optimusorien-${key}=${encodeURIComponent(value)}; path=/; max-age=604800;`;
        document.cookie = `materialize-${key}=${encodeURIComponent(value)}; path=/; max-age=604800;`;
    };

    if (window.config.user) {
        setCookie('userData', window.config.user);
        setCookie('accessToken', 'legacy-session-auth');
        setCookie('userAbilityRules', @json($abilityRules));
    } else {
        document.cookie = "userData=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "accessToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "userAbilityRules=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        try {
            localStorage.removeItem('userData');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('userAbilityRules');
        } catch (e) {}
    }
    setCookie('lang', window.config.lang);
    setConfigCookie('language', window.config.lang);
    setConfigCookie('isAppRTL', window.config.rtl ? 'true' : 'false');

    // Sync database user settings to materialize theme cookies synchronously before app initialization
    if (window.config.user_settings) {
        const settings = window.config.user_settings;

        if (settings.mode) setConfigCookie('theme', settings.mode);
        if (settings.skin) setConfigCookie('skin', settings.skin);
        if (settings.layout) {
            if (settings.layout === 'collapsed') {
                setConfigCookie('isVerticalNavCollapsed', 'true');
                setConfigCookie('appContentLayoutNav', 'vertical');
            } else {
                setConfigCookie('isVerticalNavCollapsed', 'false');
                setConfigCookie('appContentLayoutNav', settings.layout);
            }
        }
        if (settings.direction) {
            setConfigCookie('isAppRTL', settings.direction === 'rtl' ? 'true' : 'false');
        }
        if (settings.content_width) {
            setConfigCookie('appContentWidth', settings.content_width);
        }
        if (settings.primary_color) {
            setConfigCookie('lightThemePrimaryColor', settings.primary_color);
            setConfigCookie('darkThemePrimaryColor', settings.primary_color);
            setConfigCookie('lightThemePrimaryDarkenColor', settings.primary_color);
            setConfigCookie('darkThemePrimaryDarkenColor', settings.primary_color);
            localStorage.setItem('Optimusorien-initial-loader-color', settings.primary_color);
            localStorage.setItem('materialize-initial-loader-color', settings.primary_color);
        }
    }
  </script>
  @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body>
  <div id="app">
  </div>
  
  <script>
    const loaderColor = localStorage.getItem('Optimusorien-initial-loader-bg') || localStorage.getItem('materialize-initial-loader-bg') || '#FFFFFF'
    const primaryColor = localStorage.getItem('Optimusorien-initial-loader-color') || localStorage.getItem('materialize-initial-loader-color') || '#666CFF'

    if (loaderColor)
      document.documentElement.style.setProperty('--initial-loader-bg', loaderColor)

    if (primaryColor)
      document.documentElement.style.setProperty('--initial-loader-color', primaryColor)
  </script>

</body>

</html>
