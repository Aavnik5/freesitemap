import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
API_URL = "https://sfwalbum.hikeapp-pvtltd.workers.dev/feed" 
MAX_PAGES = 500 # 2000 bahut zyada hai, 500 tak real content mil jata hai

def ping_google():
    """Google ko notify karne ke liye ki sitemap update ho gaya hai"""
    sitemap_url = f"{MY_DOMAIN}/sitemap_index.xml"
    ping_url = f"https://www.google.com/ping?sitemap={sitemap_url}"
    try:
        res = requests.get(ping_url, timeout=10)
        if res.status_code == 200:
            print("✅ Google Ping Successful! Google ko khabar mil gayi hai.")
        else:
            print(f"⚠️ Ping failed with status: {res.status_code}")
    except Exception as e:
        print(f"❌ Ping Error: {e}")

def main():
    video_urls = set() # Unique links ke liye set use kar rahe hain
    
    print(f"🚀 Scraping started for {MAX_PAGES} pages...")
    
    for p in range(1, MAX_PAGES + 1):
        try:
            # Worker se data fetch karna
            res = requests.get(f"{API_URL}?page={p}&cat=new", timeout=15)
            data = res.json().get('data', [])
            
            if not data:
                print(f"🛑 No more data at Page {p}. Stopping.")
                break
            
            new_added = 0
            for item in data:
                if 'url' in item and '/videos/' in item['url']:
                    slug = item['url'].split('/videos/')[1].strip('/')
                    full_url = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
                    if full_url not in video_urls:
                        video_urls.add(full_url)
                        new_added += 1
            
            print(f"✅ Page {p}: Added {new_added} unique videos (Total: {len(video_urls)})")
            
            # Agar content repeat hone lage toh break kar do
            if new_added == 0 and p > 20:
                print("⏭️ Repeats found. Closing scan.")
                break
                
        except Exception as e:
            print(f"❌ Error at Page {p}: {e}")
            continue

    # XML Generate karo
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in video_urls:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")

    # Save to file
    ET.ElementTree(urlset).write("sitemap_1.xml", encoding="utf-8", xml_declaration=True)
    
    print(f"🏁 DONE! Total unique videos: {len(video_urls)}")
    
    # 🔥 PING GOOGLE NOW
    ping_google()

if __name__ == "__main__":
    main()
