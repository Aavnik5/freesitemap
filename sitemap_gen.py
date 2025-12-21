import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
# Aapka Worker URL jisme ab Load More/AJAX logic hai
API_URL = "https://sfwalbum.hikeapp-pvtltd.workers.dev/feed" 
MAX_PAGES = 500 

def main():
    video_urls = set()
    print("🚀 Scraping started using Load More/AJAX logic...")
    
    for p in range(1, MAX_PAGES + 1):
        try:
            # Worker ko signal bhej rahe hain ki humein Page X ka load more data chahiye
            res = requests.get(f"{API_URL}?page={p}", timeout=20)
            
            if res.status_code != 200:
                print(f"⚠️ Page {p} skip ho gaya (Status: {res.status_code})")
                continue
            
            resp_data = res.json()
            data = resp_data.get('data', [])
            
            if not data:
                print(f"🛑 No more data found at Page {p}. Stopping.")
                break
            
            new_added = 0
            for item in data:
                # 'url' ya 'video_page_url' dono check kar rahe hain
                raw_link = item.get('url') or item.get('video_page_url')
                
                if raw_link and '/videos/' in raw_link:
                    # Slug nikal kar viewer URL banao
                    slug = raw_link.split('/videos/')[1].strip('/')
                    full_url = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
                    
                    if full_url not in video_urls:
                        video_urls.add(full_url)
                        new_added += 1
            
            print(f"✅ Page {p}: Added {new_added} NEW unique videos (Total: {len(video_urls)})")
            
            # Agar 10 consecutive pages tak 0 naye video milein, toh ruk jao (Content repeat logic)
            if new_added == 0 and p > 10:
                print("⏭️ Repeats detected in Load More. Closing scan.")
                break
                
            # Server par zyada load na pade isliye thoda delay
            time.sleep(0.5)
                
        except Exception as e:
            print(f"❌ Error at Page {p}: {e}")
            continue

    # Final XML generation
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in video_urls:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")

    ET.ElementTree(urlset).write("sitemap_1.xml", encoding="utf-8", xml_declaration=True)
    print(f"🏁 DONE! Total unique videos saved in sitemap: {len(video_urls)}")

if __name__ == "__main__":
    main()
