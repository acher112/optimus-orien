"""
Badge Asset Generator for Optimus Orien.
Generates 512x512 transparent PNGs and matching SVG sources for all 47 approved badges.
Follows Stage 2 rules:
- Palette:
  - Principals: gold (#F59E0B), bronze (#B45309), charcoal (#1F2937)
  - Teachers: silver (#E2E8F0, #94A3B8), royal blue (#2563EB, #1D4ED8), white (#FFFFFF)
  - Students: emerald (#059669, #10B981) and gold (#F59E0B, #FBBF24)
  - Quizzes: purple (#7C3AED), electric blue (#2563EB), gold (#F59E0B)
  - Manual: royal purple/crimson (#9333EA, #E11D48), gold (#F59E0B), platinum (#E0F2FE)
- Tier looks:
  - Bronze: metallic bronze rim
  - Silver: silver with blue accents
  - Gold: gold premium radiant aura
  - Platinum: white-silver crystal multifaceted rim
  - Diamond: crystalline with premium prismatic sparks and halo effects
"""
import os
import sys
import math
import django
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config')
django.setup()

from core.models import BadgeDefinition

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'badges')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Color palettes by category
CATEGORY_PALETTES = {
    'principal': {
        'primary': '#D97706',
        'secondary': '#B45309',
        'accent': '#FDE68A',
        'dark': '#1F2937',
        'rim': '#92400E'
    },
    'teacher': {
        'primary': '#2563EB',
        'secondary': '#1D4ED8',
        'accent': '#60A5FA',
        'dark': '#1E293B',
        'rim': '#CBD5E1'
    },
    'student': {
        'primary': '#059669',
        'secondary': '#047857',
        'accent': '#F59E0B',
        'dark': '#064E3B',
        'rim': '#10B981'
    },
    'quiz': {
        'primary': '#7C3AED',
        'secondary': '#6D28D9',
        'accent': '#F59E0B',
        'dark': '#2E1065',
        'rim': '#3B82F6'
    },
    'manual': {
        'primary': '#9333EA',
        'secondary': '#7E22CE',
        'accent': '#F59E0B',
        'dark': '#3B0764',
        'rim': '#F43F5E'
    }
}

TIER_COLORS = {
    'bronze': {
        'outer': '#8C501E',
        'inner': '#CD7F32',
        'highlight': '#E69C24',
        'shadow': '#5C3317',
        'stars': 1
    },
    'silver': {
        'outer': '#64748B',
        'inner': '#94A3B8',
        'highlight': '#F1F5F9',
        'shadow': '#334155',
        'stars': 2
    },
    'gold': {
        'outer': '#B45309',
        'inner': '#F59E0B',
        'highlight': '#FEF3C7',
        'shadow': '#78350F',
        'stars': 3
    },
    'platinum': {
        'outer': '#0284C7',
        'inner': '#38BDF8',
        'highlight': '#F0F9FF',
        'shadow': '#0369A1',
        'stars': 4
    },
    'diamond': {
        'outer': '#4F46E5',
        'inner': '#818CF8',
        'highlight': '#C084FC',
        'shadow': '#312E81',
        'stars': 5
    }
}

def hex_to_rgb(hex_code):
    hex_code = hex_code.lstrip('#')
    return tuple(int(hex_code[i:i+2], 16) for i in (0, 2, 4))


def generate_svg(badge):
    cat = badge.category
    tier = badge.tier
    cp = CATEGORY_PALETTES.get(cat, CATEGORY_PALETTES['student'])
    tp = TIER_COLORS.get(tier, TIER_COLORS['gold'])

    # Determine emblem path based on slug keywords
    slug = badge.slug
    emblem_svg = ""
    if 'attendance' in slug or 'guardian' in slug or 'hero' in slug:
        # Shield with checkmark
        emblem_svg = f"""
        <path d="M256,130 L350,175 C350,285 256,345 256,365 C256,345 162,285 162,175 Z" fill="{cp['dark']}" opacity="0.6"/>
        <path d="M256,145 L335,185 C335,275 256,330 256,350 C256,330 177,275 177,185 Z" fill="{cp['primary']}"/>
        <path d="M220,250 L245,275 L300,215" fill="none" stroke="{tp['highlight']}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
        """
    elif 'climber' in slug or 'legend' in slug or 'starter' in slug or 'motivator' in slug or 'development' in slug:
        # Soaring chevron / mountain peak
        emblem_svg = f"""
        <polygon points="256,135 345,260 295,260 295,350 217,350 217,260 167,260" fill="{tp['highlight']}"/>
        <polygon points="256,155 330,255 285,255 285,340 227,340 227,255 182,255" fill="{cp['primary']}"/>
        <polygon points="256,185 295,245 275,245 275,325 237,325 237,245 217,245" fill="{tp['highlight']}"/>
        """
    elif 'quiz' in slug or 'speed' in slug or 'streak' in slug or 'sharpshooter' in slug or 'genius' in slug or 'mastermind' in slug:
        # Lightning / Star burst crosshair
        emblem_svg = f"""
        <circle cx="256" cy="256" r="85" fill="{cp['dark']}" opacity="0.7"/>
        <polygon points="256,135 280,225 370,225 297,278 325,365 256,312 187,365 215,278 142,225 232,225" fill="{tp['highlight']}"/>
        <circle cx="256" cy="256" r="45" fill="{cp['primary']}"/>
        <path d="M265,200 L235,260 L260,260 L245,310 L285,245 L260,245 Z" fill="{tp['highlight']}"/>
        """
    elif 'specialist' in slug or 'master' in slug or 'explorer' in slug:
        # Atom / Compass / Academic Crest
        emblem_svg = f"""
        <ellipse cx="256" cy="256" rx="90" ry="38" fill="none" stroke="{tp['highlight']}" stroke-width="8" transform="rotate(30 256 256)"/>
        <ellipse cx="256" cy="256" rx="90" ry="38" fill="none" stroke="{tp['highlight']}" stroke-width="8" transform="rotate(-30 256 256)"/>
        <circle cx="256" cy="256" r="28" fill="{cp['primary']}" stroke="{tp['highlight']}" stroke-width="6"/>
        """
    else:
        # Classical Laurel Wreath with Crest
        emblem_svg = f"""
        <circle cx="256" cy="256" r="80" fill="{cp['primary']}"/>
        <polygon points="256,170 278,225 338,228 290,268 308,326 256,290 204,326 222,268 174,228 234,225" fill="{tp['highlight']}"/>
        <circle cx="256" cy="256" r="32" fill="{cp['dark']}"/>
        <path d="M256,236 L262,250 L276,252 L266,262 L268,276 L256,270 L244,276 L246,262 L236,252 L250,250 Z" fill="{tp['highlight']}"/>
        """

    # Stars according to tier
    star_count = tp['stars']
    stars_svg = ""
    start_x = 256 - ((star_count - 1) * 22)
    for s_idx in range(star_count):
        sx = start_x + (s_idx * 44)
        stars_svg += f"""
        <polygon points="{sx},{385} {sx+4},{394} {sx+14},{394} {sx+6},{401} {sx+9},{411} {sx},{404} {sx-9},{411} {sx-6},{401} {sx-14},{394} {sx-4},{394}" fill="{tp['highlight']}" stroke="{tp['outer']}" stroke-width="1.5"/>
        """

    # Diamond tier prismatic crystal halo
    prismatic_svg = ""
    if tier == 'diamond':
        prismatic_svg = f"""
        <circle cx="256" cy="256" r="235" fill="none" stroke="url(#diamondGlow)" stroke-width="12" stroke-dasharray="14,10" opacity="0.85"/>
        <polygon points="256,15 264,35 256,55 248,35" fill="#E0E7FF"/>
        <polygon points="256,457 264,477 256,497 248,477" fill="#E0E7FF"/>
        <polygon points="15,256 35,264 55,256 35,248" fill="#E0E7FF"/>
        <polygon points="457,256 477,264 497,256 477,248" fill="#E0E7FF"/>
        """
    elif tier == 'platinum':
        prismatic_svg = f"""
        <circle cx="256" cy="256" r="232" fill="none" stroke="{tp['highlight']}" stroke-width="6" stroke-dasharray="8,6" opacity="0.7"/>
        """

    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
        <radialGradient id="bgGrad" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stop-color="{tp['highlight']}"/>
            <stop offset="40%" stop-color="{tp['inner']}"/>
            <stop offset="100%" stop-color="{tp['outer']}"/>
        </radialGradient>
        <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="{tp['highlight']}"/>
            <stop offset="50%" stop-color="{tp['inner']}"/>
            <stop offset="100%" stop-color="{tp['shadow']}"/>
        </linearGradient>
        <linearGradient id="diamondGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38BDF8"/>
            <stop offset="50%" stop-color="#818CF8"/>
            <stop offset="100%" stop-color="#C084FC"/>
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
        </filter>
    </defs>

    <!-- Outer Medallion Shadow & Rim -->
    <g filter="url(#shadow)">
        <circle cx="256" cy="256" r="226" fill="url(#rimGrad)" stroke="{tp['shadow']}" stroke-width="4"/>
        <circle cx="256" cy="256" r="214" fill="{cp['dark']}"/>
        <circle cx="256" cy="256" r="202" fill="url(#bgGrad)"/>
        <circle cx="256" cy="256" r="190" fill="{cp['dark']}" opacity="0.15"/>
    </g>

    <!-- Prismatic / Crystal Halo -->
    {prismatic_svg}

    <!-- Central Emblem -->
    <g>
        {emblem_svg}
    </g>

    <!-- Star Tier Indicators -->
    <g>
        {stars_svg}
    </g>
</svg>"""
    return svg_content


def generate_png(badge, svg_filename, png_filename):
    cat = badge.category
    tier = badge.tier
    cp = CATEGORY_PALETTES.get(cat, CATEGORY_PALETTES['student'])
    tp = TIER_COLORS.get(tier, TIER_COLORS['gold'])

    # 512x512 transparent RGBA image
    img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Convert hex colors to RGBA
    c_rim = hex_to_rgb(tp['outer']) + (255,)
    c_inner = hex_to_rgb(tp['inner']) + (255,)
    c_highlight = hex_to_rgb(tp['highlight']) + (255,)
    c_shadow = hex_to_rgb(tp['shadow']) + (255,)
    c_dark = hex_to_rgb(cp['dark']) + (255,)
    c_primary = hex_to_rgb(cp['primary']) + (255,)

    # Outer drop shadow (multiple blurred translucent circles)
    for offset in range(8, 0, -2):
        alpha = int(25 * (9 - offset) / 8)
        draw.ellipse([46 - offset, 46 - offset + 8, 466 + offset, 466 + offset + 8], fill=(0, 0, 0, alpha))

    # Outer Rim
    draw.ellipse([30, 30, 482, 482], fill=c_rim, outline=c_shadow, width=4)
    draw.ellipse([42, 42, 470, 470], fill=c_dark)
    draw.ellipse([54, 54, 458, 458], fill=c_inner, outline=c_highlight, width=6)
    draw.ellipse([68, 68, 444, 444], fill=c_primary)

    # Inner decorative ring
    draw.ellipse([90, 90, 422, 422], outline=c_highlight, width=3)

    slug = badge.slug
    # Draw core emblem
    if 'attendance' in slug or 'guardian' in slug or 'hero' in slug:
        # Shield with checkmark
        shield_pts = [
            (256, 130), (350, 175), (350, 275), (256, 355), (162, 275), (162, 175)
        ]
        draw.polygon(shield_pts, fill=c_dark, outline=c_highlight)
        # Checkmark
        draw.line([(215, 245), (245, 275), (305, 205)], fill=c_highlight, width=16)

    elif 'climber' in slug or 'legend' in slug or 'starter' in slug or 'motivator' in slug or 'development' in slug:
        # Upward Chevron / Arrow
        arrow_pts = [
            (256, 140), (340, 255), (295, 255), (295, 340), (217, 340), (217, 255), (172, 255)
        ]
        draw.polygon(arrow_pts, fill=c_highlight, outline=c_shadow)
        inner_arrow = [
            (256, 175), (315, 250), (280, 250), (280, 325), (232, 325), (232, 250), (197, 250)
        ]
        draw.polygon(inner_arrow, fill=c_primary)

    elif 'quiz' in slug or 'speed' in slug or 'streak' in slug or 'sharpshooter' in slug:
        # Crosshair / starburst
        draw.ellipse([175, 175, 337, 337], fill=c_dark, outline=c_highlight, width=4)
        # 8-pointed star
        star_pts = []
        for i in range(16):
            r = 75 if i % 2 == 0 else 40
            angle = i * (math.pi / 8) - (math.pi / 2)
            star_pts.append((256 + r * math.cos(angle), 256 + r * math.sin(angle)))
        draw.polygon(star_pts, fill=c_highlight, outline=c_shadow)
        draw.ellipse([225, 225, 287, 287], fill=c_primary)

    else:
        # Laurel / Classic Medal Star
        star_pts = []
        for i in range(10):
            r = 85 if i % 2 == 0 else 42
            angle = i * (math.pi / 5) - (math.pi / 2)
            star_pts.append((256 + r * math.cos(angle), 256 + r * math.sin(angle)))
        draw.polygon(star_pts, fill=c_highlight, outline=c_shadow)
        draw.ellipse([215, 215, 297, 297], fill=c_dark)
        draw.ellipse([230, 230, 282, 282], fill=c_primary, outline=c_highlight, width=3)

    # Tier Stars at bottom
    star_count = tp['stars']
    start_x = 256 - ((star_count - 1) * 24)
    for s_idx in range(star_count):
        sx = start_x + (s_idx * 48)
        s_pts = []
        for i in range(10):
            r = 14 if i % 2 == 0 else 7
            angle = i * (math.pi / 5) - (math.pi / 2)
            s_pts.append((sx + r * math.cos(angle), 400 + r * math.sin(angle)))
        draw.polygon(s_pts, fill=c_highlight, outline=c_shadow)

    # Diamond / Platinum corner crystals
    if tier == 'diamond':
        for cx, cy in [(256, 32), (256, 480), (32, 256), (480, 256)]:
            dia_pts = [(cx, cy - 18), (cx + 12, cy), (cx, cy + 18), (cx - 12, cy)]
            draw.polygon(dia_pts, fill=(224, 231, 255, 255), outline=c_shadow)

    img.save(png_filename, 'PNG', optimize=True)


def main():
    badges = BadgeDefinition.objects.filter(is_active=True).order_by('category', 'tier', 'name')
    print(f"Generating assets for {badges.count()} badges in {OUTPUT_DIR}...")

    generated = 0
    for b in badges:
        asset_name = b.icon_asset_name
        base_name = os.path.splitext(asset_name)[0]

        svg_path = os.path.join(OUTPUT_DIR, f"{base_name}.svg")
        png_path = os.path.join(OUTPUT_DIR, f"{base_name}.png")

        # 1. Generate SVG
        svg_content = generate_svg(b)
        with open(svg_path, 'w', encoding='utf-8') as f:
            f.write(svg_content)

        # 2. Generate 512x512 transparent PNG
        generate_png(b, svg_path, png_path)

        generated += 1

    print(f"Successfully generated {generated} SVG sources and {generated} 512x512 transparent PNG assets!")

if __name__ == '__main__':
    main()
