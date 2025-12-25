import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time
import urllib.parse 

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"

# APIs
STD_API_URL = "https://sfwalbum.hikeapp-pvtltd.workers.dev/feed"
DESI_API_URL = "https://desitales-scraper.slayeranika.workers.dev/desi-feed"

MAX_PAGES = 5 

def main():
    video_urls = set()
    print("🚀 Sitemap Generation Started (Final Combined Version)...")
    
    for p in range(1, MAX_PAGES + 1):
        print(f"\n--- Processing Page {p} ---")

        # ==========================================
        # 1. Standard Videos (video-viewer.html)
        # ==========================================
        try:
            res_std = requests.get(f"{STD_API_URL}?page={p}", timeout=20)
            if res_std.status_code == 200:
                data_std = res_std.json().get('data', [])
                count_std = 0
                for item in data_std:
                    raw_link = item.get('url') or item.get('video_page_url')
                    # Link example: https://dood.re/videos/slug
                    if raw_link and '/videos/' in raw_link:
                        slug = raw_link.split('/videos/')[1].strip('/')
                        full_url = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
                        
                        if full_url not in video_urls:
                            video_urls.add(full_url)
                            count_std += 1
                print(f"   🎥 Standard: Added {count_std}")
        except Exception as e:
            print(f"   ❌ Standard Error: {e}")

        # ==========================================
        # 2. Desi Videos (desiporn.html?v=...)
        # ==========================================
        try:
            # Desi Worker se Latest videos la rahe hain
            res_desi = requests.get(f"{DESI_API_URL}?page={p}&filter=latest", timeout=20)
            if res_desi.status_code == 200:
                data_desi = res_desi.json().get('data', [])
                count_desi = 0
                
                for item in data_desi:
                    raw_link = item.get('video_page_url') 
                    # Example: https://spankbang.com/9qywh/video/desi+girl
                    
                    if raw_link:
                        # Domain hatakar sirf path nikalte hain (9qywh/video/desi+girl)
                        clean_path = raw_link.replace("https://spankbang.com/", "").strip("/")
                        
                        # Path ko safe URL format me badalte hain (/ ban jayega %2F)
                        encoded_slug = urllib.parse.quote(clean_path, safe='')
                        
                        # Final URL
                        full_url = f"{MY_DOMAIN}/desiporn.html?v={encoded_slug}"
                        
                        if full_url not in video_urls:
                            video_urls.add(full_url)
                            count_desi += 1
                print(f"   🇮🇳 Desi: Added {count_desi}")
        except Exception as e:
            print(f"   ❌ Desi Error: {e}")

        time.sleep(1)

    # ==========================================
    # 3. XML File Save Karna
    # ==========================================
    print(f"\n📝 Generating sitemap.xml with {len(video_urls)} links...")
    
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    
    for link in video_urls:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
        ET.SubElement(u, "changefreq").text = "daily"

    # File ka naam 'sitemap.xml' rakha hai (yehi main file hoti hai)
    ET.ElementTree(urlset).write("sitemap.xml", encoding="utf-8", xml_declaration=True)
    print(f"🏁 DONE! 'sitemap.xml' saved successfully.")

if __name__ == "__main__":
    main()
