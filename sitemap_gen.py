import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
API_URL = "https://sfwalbum.hikeapp-pvtltd.workers.dev/feed" 
MAX_PAGES = 300 # Test ke liye 300 rakho, bad mein badha lena

def main():
    video_urls = set()
    print(f"🚀 Scraping started...")
    
    for p in range(1, MAX_PAGES + 1):
        try:
            res = requests.get(f"{API_URL}?page={p}", timeout=15)
            if res.status_code != 200: continue
            
            data = res.json().get('data', [])
            if not data: break
            
            new_added = 0
            for item in data:
                # 🔍 Sabse Flexible Link Detection
                # Ye 'url', 'video_page_url', aur 'finalUrl' teeno check karega
                raw_link = item.get('url') or item.get('video_page_url') or item.get('finalUrl')
                
                if raw_link and ('/videos/' in raw_link or '/video/' in raw_link):
                    # Slug nikalne ka asaan tarika
                    slug = raw_link.split('/video')[-1].replace('s/', '').strip('/')
                    full_url = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
                    
                    if full_url not in video_urls:
                        video_urls.add(full_url)
                        new_added += 1
            
            print(f"✅ Page {p}: Added {new_added} unique videos (Current Total: {len(video_urls)})")
            
            # Agar 15 pages tak 0 naye mile toh stop kar do
            if new_added == 0 and p > 15: break
                
        except Exception as e:
            print(f"❌ Error at Page {p}: {e}")
            continue

    # XML Generate karo
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in video_urls:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")

    ET.ElementTree(urlset).write("sitemap_1.xml", encoding="utf-8", xml_declaration=True)
    print(f"🏁 DONE! Total unique videos saved: {len(video_urls)}")

if __name__ == "__main__":
    main()
