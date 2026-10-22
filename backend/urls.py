from django.contrib import admin
from django.urls import path,include
from core import views
urlpatterns=[path('',views.health),path('health/',views.health),path('api/health/',views.health),path('admin/',admin.site.urls),path('api/v1/',include('core.urls'))]
