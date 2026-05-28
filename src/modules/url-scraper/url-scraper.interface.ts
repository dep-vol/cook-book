export interface IUrlScraper {
  scrape(url: string): Promise<string>
}
