import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
API_URL = f"{MY_DOMAIN}/feed" 
MAX_PAGES = 100 # Kitne pages tak videos uthane hain
LINKS_PER_SITEMAP = 40000 

def fetch_videos(page_no):
    """Tere Worker ke /feed se data uthakar slug nikalta hai"""
    print(f"🔎 Fetching Page {page_no}...")
    try:
        params = {'page': page_no, 'cat': 'new'}
        headers = {'User-Agent': 'Mozilla/5.0'}
        
        response = requests.get(API_URL, params=params, headers=headers, timeout=25)
        
        if response.status_code != 200:
            print(f"🛑 Worker Error {response.status_code} at Page {page_no}")
            return None

        data = response.json()
        items = data.get('data', [])
        
        if not items:
            return None

        slugs = []
        for item in items:
            v_url = item.get('video_page_url', '')
            # freshporno link se slug nikalna: /videos/slug-name/
            if '/videos/' in v_url:
                slug = v_url.split('/videos/')[1].strip('/')
                slugs.append(slug)
        return slugs
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def main():
    all_slugs = []
    
    # 1. Video Slugs jama karo
    for p in range(1, MAX_PAGES + 1):
        page_slugs = fetch_videos(p)
        if page_slugs is None: break
        
        all_slugs.extend(page_slugs)
        print(f"✅ Page {p}: Found {len(page_slugs)} videos")
        time.sleep(1) # Block hone se bachne ke liye

    all_slugs = list(set(all_slugs))
    print(f"📊 Total Unique Videos: {len(all_slugs)}")

    if not all_slugs:
        print("❌ Data nahi mila. Worker check kar!")
        return

    # 2. Sitemap Files (Tere format ke hisaab se)
    sitemap_files = []
    for i in range(0, len(all_slugs), LINKS_PER_SITEMAP):
        chunk = all_slugs[i : i + LINKS_PER_SITEMAP]
        f_name = f"sitemap_{ (i//LINKS_PER_SITEMAP) + 1 }.xml"
        
        urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
        for slug in chunk:
            url_tag = ET.SubElement(urlset, "url")
            loc = ET.SubElement(url_tag, "loc")
            # TERE URL FORMAT KE HISAB SE:
            loc.text = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
            ET.SubElement(url_tag, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
        
        tree = ET.ElementTree(urlset)
        tree.write(f_name, encoding="utf-8", xml_declaration=True)
        sitemap_files.append(f_name)

    # 3. Sitemap Index
    index = ET.Element("sitemapindex", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for f in sitemap_files:
        s = ET.SubElement(index, "sitemap")
        ET.SubElement(s, "loc").text = f"{MY_DOMAIN}/{f}"
        ET.SubElement(s, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
    
    tree = ET.ElementTree(index)
    tree.write("sitemap_index.xml", encoding="utf-8", xml_declaration=True)
    print("🚀 Sitemap Index Created!")

if __name__ == "__main__":
    main()
