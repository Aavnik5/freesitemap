import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import os

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
SOURCE_RSS = "https://freshporno.net/feed/rss/" # Latest videos
# Aap aur bhi source URLs yahan add kar sakte hain (Popular, Top Rated)

def create_sitemap_xml(urls, filename):
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for url in urls:
        url_tag = ET.SubElement(urlset, "url")
        ET.SubElement(url_tag, "loc").text = url
        ET.SubElement(url_tag, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
        ET.SubElement(url_tag, "changefreq").text = "daily"
    
    tree = ET.ElementTree(urlset)
    tree.write(filename, encoding="utf-8", xml_declaration=True)

def generate_index(sitemap_files):
    index = ET.Element("sitemapindex", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for f in sitemap_files:
        sitemap = ET.SubElement(index, "sitemap")
        ET.SubElement(sitemap, "loc").text = f"{MY_DOMAIN}/{f}"
        ET.SubElement(sitemap, "lastmod").text = datetime.now().strftime("%Y-%m-%d")
    
    tree = ET.ElementTree(index)
    tree.write("sitemap_index.xml", encoding="utf-8", xml_declaration=True)

def main():
    print("🔄 Fetching videos...")
    try:
        res = requests.get(SOURCE_RSS, timeout=20)
        # Yahan RSS parse karke links nikalne ka logic
        # Maan lo humein 1 lakh links mile (Sample logic)
        all_links = [] 
        # ... (RSS parsing logic yahan aayega) ...
        
        # Chunks mein divide karna (Har file mein 40k links)
        chunk_size = 40000
        sitemap_files = []
        for i in range(0, len(all_links), chunk_size):
            chunk = all_links[i:i + chunk_size]
            fname = f"sitemap_{i//chunk_size + 1}.xml"
            create_sitemap_xml(chunk, fname)
            sitemap_files.append(fname)
        
        generate_index(sitemap_files)
        print("✅ Sitemap Index Generated!")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
