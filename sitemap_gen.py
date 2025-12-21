import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time
import os

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
API_URL = f"{MY_DOMAIN}/feed" 
# Millions of links ke liye MAX_PAGES ko badha sakte ho (e.g. 500 or 1000)
MAX_PAGES = 100 
LINKS_PER_SITEMAP = 40000 

def fetch_videos_from_worker(page_no):
    """Tere Worker ke /feed?page=X se data mangta hai"""
    print(f"🔎 Scanning Page {page_no}...")
    try:
        # Load More wala same request format
        params = {'page': page_no, 'cat': 'new'}
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        
        response = requests.get(API_URL, params=params, headers=headers, timeout=25)
        
        if response.status_code != 200:
            print(f"🛑 Worker ne error diya (Status: {response.status_code})")
            return None

        data = response.json()
        items = data.get('data', [])
        
        if not items or len(items) == 0:
            print(f"📭 Page {page_no} khali hai. Sab videos khatam!")
            return None

        slugs = []
        for item in items:
            full_url = item.get('video_page_url', '')
            # Extracting Slug: freshporno.net/videos/slug-name/ -> slug-name
            if '/videos/' in full_url:
                parts = full_url.split('/videos/')
                if len(parts) > 1:
                    slug = parts[1].strip('/')
                    slugs.append(slug)
        
        return slugs

    except Exception as e:
        print(f"❌ Error fetching page {page_no}: {e}")
        return []

def main():
    all_unique_slugs = []
    
    # 1. Page by Page Loop (Load More Logic)
    for p in range(1, MAX_PAGES + 1):
        slugs = fetch_videos_from_worker(p)
        
        if slugs is None: # Agar 404 ya empty mile toh loop break karo
            break
            
        all_unique_slugs.extend(slugs)
        print(f"✅ Found {len(slugs)} videos on Page {p}")
        
        # Site/Worker ko block hone se bachane ke liye 1 sec ka gap
        time.sleep(1)

    # Duplicates saaf karo
    all_unique_slugs = list(set(all_unique_slugs))
    total_count = len(all_unique_slugs)
    print(f"📊 Total Unique Videos Collected: {total_count}")

    if total_count == 0:
        print("❌ Kuch bhi nahi mila! Worker.js check kar.")
        return

    # 2. Slugs ko 40,000 ke chunks mein divide karke files banana
    sitemap_files = []
    for i in range(0, total_count, LINKS_PER_SITEMAP):
        chunk = all_unique_slugs[i : i + LINKS_PER_SITEMAP]
        file_no = (i // LINKS_PER_SITEMAP) + 1
        filename = f"sitemap_{file_no}.xml"
        
        # XML Structure
        urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
        for slug in chunk:
            url_tag = ET.SubElement(urlset, "url")
            loc = ET.SubElement(url_tag, "loc")
            # Tere video-viewer ka asli URL
            loc.text = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
            
            lastmod = ET.SubElement(url_tag, "lastmod")
            lastmod.text = datetime.now().strftime("%Y-%m-%d")
        
        tree = ET.ElementTree(urlset)
        tree.write(filename, encoding="utf-8", xml_declaration=True)
        sitemap_files.append(filename)
        print(f"📄 Created: {filename}")

    # 3. Sitemap Index (Main Baap File) banana
    index = ET.Element("sitemapindex", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for f in sitemap_files:
        sitemap_tag = ET.SubElement(index, "sitemap")
        loc_tag = ET.SubElement(sitemap_tag, "loc")
        loc_tag.text = f"{MY_DOMAIN}/{f}"
        
        lastmod_tag = ET.SubElement(sitemap_tag, "lastmod")
        lastmod_tag.text = datetime.now().strftime("%Y-%m-%d")
    
    tree = ET.ElementTree(index)
    tree.write("sitemap_index.xml", encoding="utf-8", xml_declaration=True)
    print("🚀 MISSION SUCCESS: Sitemap Index Updated!")

if __name__ == "__main__":
    main()
