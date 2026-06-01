export interface ScrapeResult {
  text: string
  imageUrl?: string
}

export interface IUrlScraper {
  scrape(url: string): Promise<ScrapeResult>
}
