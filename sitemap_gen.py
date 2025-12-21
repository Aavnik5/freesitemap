import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site" # Sitemap ke links ke liye
# Data fetch karne ke liye seedha Cloudflare Worker use karenge
API_URL = "https://sfwalbum.hikeapp-pvtltd.workers.dev/feed" 

MAX_PAGES = 1000 # Kitne pages scan karne hain (Badha sakte ho)
LINKS_PER_SITEMAP = 40000 

def fetch_data(page_no):
    print(f"🔎 Fetching Page {page_no} via Workers.dev...")
    try:
        params = {'page': page_no, 'cat': 'new'}
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
        
        # Seedha Worker URL call kar rahe hain
        res = requests.get(API_URL, params=params, headers=headers, timeout=30)
        
        if res.status_code != 200:
            print(f"🛑 Worker Error {res.status_code}. Deploy check karo!")
            return None
            
        data = res.json().get('data', [])
        return data
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return []

def main():
    video_links = []
    
    for p in range(1, MAX_PAGES + 1):
        items = fetch_data(p)
        if items is None: break # Error aane pe ruk jao
        if not items: 
            print(f"📭 Page {p} khali hai. Exit.")
            break 
        
        for item in items:
            url = item.get('video_page_url', '')
            if '/videos/' in url:
                # freshporno link se slug nikalna: /videos/slug-name/
                slug = url.split('/videos/')[1].strip('/')
                # Sitemap mein asli domain ka link dalna
                video_links.append(f"{MY_DOMAIN}/video-viewer.html?view={slug}")
        
        print(f"✅ Page {p}: Found {len(items)} videos")
        time.sleep(1) # Gap zaroori hai

    video_links = list(set(video_links))
    if not video_links:
        print("❌ Kuch nahi mila! Worker ka response check kar.")
        return

    # 1. Individual Sitemap (sitemap_1.xml)
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in video_links:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
    
    ET.ElementTree(urlset).write("sitemap_1.xml", encoding="utf-8", xml_declaration=True)
    
    # 2. Sitemap Index (sitemap_index.xml)
    idx = ET.Element("sitemapindex", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    s = ET.SubElement(idx, "sitemap")
    ET.SubElement(s, "loc").text = f"{MY_DOMAIN}/sitemap_1.xml"
    ET.SubElement(s, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
    
    ET.ElementTree(idx).write("sitemap_index.xml", encoding="utf-8", xml_declaration=True)
    
    print(f"🚀 SUCCESS! Found {len(video_links)} videos and generated sitemaps.")

if __name__ == "__main__":
    main()
