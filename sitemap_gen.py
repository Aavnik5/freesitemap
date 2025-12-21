import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
API_URL = "https://sfwalbum.hikeapp-pvtltd.workers.dev/feed" 
MAX_PAGES = 20 #
LINKS_PER_SITEMAP = 40000 

def ping_google():
    """Google ko notify karne ke liye ki sitemap update ho gaya hai"""
    sitemap_url = f"{MY_DOMAIN}/sitemap_index.xml"
    ping_url = f"https://www.google.com/ping?sitemap={sitemap_url}"
    try:
        res = requests.get(ping_url)
        if res.status_code == 200:
            print("✅ Google Ping Successful! Google ko khabar mil gayi hai.")
        else:
            print(f"⚠️ Ping failed with status: {res.status_code}")
    except Exception as e:
        print(f"❌ Ping Error: {e}")

def fetch_data(page_no):
    print(f"🔎 Fetching Page {page_no} via Workers.dev...") #
    try:
        params = {'page': page_no, 'cat': 'new'}
        res = requests.get(API_URL, params=params, timeout=10)
        return res.json().get('data', []) if res.status_code == 200 else []
    except: return []

def main():
    video_urls = []
    # Loop for fetching 2000 pages
    for p in range(1, MAX_PAGES + 1):
        data = fetch_data(p)
        if not data: break
        for item in data:
            slug = item['url'].split('/videos/')[1].strip('/')
            video_urls.append(f"{MY_DOMAIN}/video-viewer.html?view={slug}")
        time.sleep(0.1) # Safe crawling

    # Sitemap XML creation logic
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in video_urls:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")

    # File write and push to GitHub/Netlify
    ET.ElementTree(urlset).write("sitemap_1.xml", encoding="utf-8", xml_declaration=True)
    
    print(f"🚀 Sitemap created with {len(video_urls)} links!")
    
    # 🔥 PING GOOGLE NOW
    ping_google()

if __name__ == "__main__":
    main()
