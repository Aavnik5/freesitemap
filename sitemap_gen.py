import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import os

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
# Hum tere Worker ke API se data lenge
API_URL = f"{MY_DOMAIN}/feed" 
MAX_PAGES = 50  # Kitne pages scan karne hain
LINKS_PER_SITEMAP = 40000 

def fetch_videos_from_api(page_no):
    """Tere Worker se JSON data nikalta hai"""
    print(f"🔎 Fetching data from your site: Page {page_no}...")
    try:
        # Worker ko call kar rahe hain: /feed?page=1
        params = {'page': page_no, 'cat': 'new'}
        res = requests.get(API_URL, params=params, timeout=20)
        
        if res.status_code != 200:
            print(f"⚠️ Worker error on page {page_no}: {res.status_code}")
            return []
            
        json_data = res.json()
        videos = json_data.get('data', [])
        
        slugs = []
        for vid in videos:
            # video_page_url se slug nikalna
            # Example: https://freshporno.net/videos/slug-name/ -> slug-name
            full_url = vid.get('video_page_url', '')
            if '/videos/' in full_url:
                slug = full_url.split('/videos/')[1].strip('/')
                slugs.append(slug)
        
        return slugs
    except Exception as e:
        print(f"❌ Connection error on page {page_no}: {e}")
        return []

def create_sitemap_file(slugs, file_no):
    filename = f"sitemap_{file_no}.xml"
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for slug in slugs:
        url_tag = ET.SubElement(urlset, "url")
        loc = ET.SubElement(url_tag, "loc")
        loc.text = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
        ET.SubElement(url_tag, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
    tree = ET.ElementTree(urlset)
    tree.write(filename, encoding="utf-8", xml_declaration=True)
    return filename

def create_index_file(sitemap_files):
    filename = "sitemap_index.xml"
    index = ET.Element("sitemapindex", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for f in sitemap_files:
        sitemap = ET.SubElement(index, "sitemap")
        ET.SubElement(sitemap, "loc").text = f"{MY_DOMAIN}/{f}"
        ET.SubElement(sitemap, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
    tree = ET.ElementTree(index)
    tree.write(filename, encoding="utf-8", xml_declaration=True)
    print(f"✅ Sitemap Index created with {len(sitemap_files)} files.")

def main():
    all_slugs = []
    for p in range(1, MAX_PAGES + 1):
        page_slugs = fetch_videos_from_api(p)
        if page_slugs:
            print(f"✅ Received {len(page_slugs)} videos from your Worker (Page {p})")
            all_slugs.extend(page_slugs)
        else:
            print(f"❗ No data on page {p}")

    all_slugs = list(set(all_slugs))
    print(f"📊 Total Unique Videos: {len(all_slugs)}")

    if not all_slugs:
        print("❌ Worker se koi data nahi mila. Check karo ki site pe videos dikh rahe hain ya nahi.")
        return

    sitemap_files = []
    for i in range(0, len(all_slugs), LINKS_PER_SITEMAP):
        chunk = all_slugs[i : i + LINKS_PER_SITEMAP]
        file_no = (i // LINKS_PER_SITEMAP) + 1
        fname = create_sitemap_file(chunk, file_no)
        sitemap_files.append(fname)
    create_index_file(sitemap_files)

if __name__ == "__main__":
    main()
