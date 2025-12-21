import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

MY_DOMAIN = "https://freepornx.site"
API_URL = f"{MY_DOMAIN}/feed"
MAX_PAGES = 50 

def fetch_data(page_no):
    print(f"🔎 Fetching Page {page_no}...")
    try:
        # Requesting your worker
        res = requests.get(API_URL, params={'page': page_no}, timeout=25)
        if res.status_code != 200:
            print(f"🛑 Error {res.status_code}. Route setup check karo!")
            return None
        return res.json().get('data', [])
    except: return []

def main():
    video_links = []
    model_paths = []
    channel_paths = []

    for p in range(1, MAX_PAGES + 1):
        data = fetch_data(p)
        if data is None: break
        for item in data:
            url = item.get('video_page_url', '')
            if '/videos/' in url:
                slug = url.split('/videos/')[1].strip('/')
                video_links.append(f"{MY_DOMAIN}/video-viewer.html?view={slug}")
            
            # Agar data mein models/channels ki info hai (Optional)
            # Yahan aap logic add kar sakte ho agar aapka /feed models bhi bhejta hai
            
        time.sleep(0.5)

    video_links = list(set(video_links))
    
    # Sitemap creation
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in video_links:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
    
    ET.ElementTree(urlset).write("sitemap_1.xml", encoding="utf-8", xml_declaration=True)
    
    # Sitemap Index
    idx = ET.Element("sitemapindex", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    s = ET.SubElement(idx, "sitemap")
    ET.SubElement(s, "loc").text = f"{MY_DOMAIN}/sitemap_1.xml"
    ET.ElementTree(idx).write("sitemap_index.xml", encoding="utf-8", xml_declaration=True)
    
    print(f"🚀 Done! Found {len(video_links)} videos.")

if __name__ == "__main__":
    main()
