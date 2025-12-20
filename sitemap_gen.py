import requests
import re
import xml.etree.ElementTree as ET
from datetime import datetime
import os

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
SOURCE_DOMAIN = "https://freshporno.net"
# Kitne pages scan karne hain? (GitHub Action limit ke liye start mein 50-100 rakho)
MAX_PAGES = 50 
LINKS_PER_SITEMAP = 40000 

def fetch_slugs_from_page(page_no):
    """Source site ke pagination se video slugs nikalta hai"""
    url = f"{SOURCE_DOMAIN}/videos/page/{page_no}/"
    if page_no == 1: url = f"{SOURCE_DOMAIN}/videos/"
    
    print(f"🔎 Scanning Page {page_no}...")
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code != 200: return []
        
        # Regex to find video slugs from URLs like /videos/slug-name/
        slugs = re.findall(r'/videos/([^/"]+)/', res.text)
        # Unique slugs only
        return list(set(slugs))
    except Exception as e:
        print(f"❌ Error on page {page_no}: {e}")
        return []

def create_sitemap_file(slugs, file_no):
    """Ek individual sitemap file (sitemap_1.xml) banata hai"""
    filename = f"sitemap_{file_no}.xml"
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    
    for slug in slugs:
        url_tag = ET.SubElement(urlset, "url")
        loc = ET.SubElement(url_tag, "loc")
        # Aapka viewer URL format
        loc.text = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
        
        lastmod = ET.SubElement(url_tag, "lastmod")
        lastmod.text = datetime.now().strftime("%Y-%m-%d")

    tree = ET.ElementTree(urlset)
    tree.write(filename, encoding="utf-8", xml_declaration=True)
    return filename

def create_index_file(sitemap_files):
    """Saari sitemaps ka ek 'Baap' (Index) banata hai"""
    filename = "sitemap_index.xml"
    index = ET.Element("sitemapindex", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    
    for f in sitemap_files:
        sitemap = ET.SubElement(index, "sitemap")
        loc = ET.SubElement(sitemap, "loc")
        loc.text = f"{MY_DOMAIN}/{f}"
        
        lastmod = ET.SubElement(sitemap, "lastmod")
        lastmod.text = datetime.now().strftime("%Y-%m-%d")
        
    tree = ET.ElementTree(index)
    tree.write(filename, encoding="utf-8", xml_declaration=True)
    print(f"✅ Sitemap Index created with {len(sitemap_files)} files.")

def main():
    all_slugs = []
    
    # 1. Alag alag pages se links jama karo
    for p in range(1, MAX_PAGES + 1):
        page_slugs = fetch_slugs_from_page(p)
        all_slugs.extend(page_slugs)
    
    # Unique links (Duplicates hatao)
    all_slugs = list(set(all_slugs))
    print(f"📊 Total Unique Videos found: {len(all_slugs)}")

    if not all_slugs:
        print("❌ No videos found. Check Source Site structure.")
        return

    # 2. Slugs ko chunks mein divide karke files banao
    sitemap_files = []
    for i in range(0, len(all_slugs), LINKS_PER_SITEMAP):
        chunk = all_slugs[i : i + LINKS_PER_SITEMAP]
        file_no = (i // LINKS_PER_SITEMAP) + 1
        fname = create_sitemap_file(chunk, file_no)
        sitemap_files.append(fname)
        
    # 3. Main Index file banao
    create_index_file(sitemap_files)

if __name__ == "__main__":
    main()
