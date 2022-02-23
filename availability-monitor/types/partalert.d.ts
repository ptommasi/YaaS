interface PartAlertItem {
  availability: 'in_stock' | string,
  category: 'rtx3070' | 'rtx3060ti',
  id: string; // 'Amazon.it-B08KHHF881',
  image_url: string; // 'https://m.media-amazon.com/images/I/517N0blduTL._SL160_.jpg',
  name: string; // 'ASUS ROG Strix GeForce RTX 3070 8GB OC Edition Gaming Scheda grafica (GDDR6, PCIe 4.0, 2x HDMI 2.1, 3x DisplayPort 1.4a, 1x USB-C, ROG-STRIX-RTX3070-O8G-GAMING)',
  price: string; // '€1,799.00',
  store: string; // 'Amazon Italy',
  timestamp: string; // '16:44 UTC (27.3.2021)',
  url: string; // 'https://www.amazon.it/_itm/dp/B08KHHF881?tag=partalertit-21&amp;linkCode=ogi&amp;th=1&amp;psc=1&amp;smid=A11IL2PNWYJU7H'
                // now is "https://partalert.net/product.js?asin=B08NW32F74&price=%C2%A31%2C249.99&smid=A3P5ROKL5A1OLE&tag=partalert-21&timestamp=18%3A50+UTC+%2813.4.2021%29&title=MSI+GeForce+RTX+3060+Ti+GAMING+X+TRIO+Gaming+Graphics+Card+-+RTX+3060+Ti%2C+TRI+FROZR+2+%2C+TORX+Fan+4.0%2C+8GB+GDDR6%2C+256+bit%2C+PCI+Express+Gen+4%2C+DisplayPort+v1.4a%2C+HDMI+2.1%2C+Zero+Frozr%2C+1440p+resolution&tld=.co.uk"
}
