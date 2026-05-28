# URL Scraping — Design Spec

## Goal

Позволить пользователю отправить боту ссылку (Instagram, YouTube, кулинарный сайт) и автоматически сохранить рецепт из неё.

## Architecture

```
Bot (onText с URL)
  → RecipeBot  — детектит URL по regex
  → ImportJobService.importFromUrl(url)
  → CheerioScraper.scrape(url)   — возвращает raw text
  → IRecipeParser.parseText(text) — DeepSeek, уже существует
  → RecipeService.create(parsed)
```

## File Structure

```
src/modules/url-scraper/
├── url-scraper.interface.ts     # IUrlScraper { scrape(url: string): Promise<string> }
└── cheerio.scraper.ts           # CheerioScraper — единственная реализация

src/tokens/url-scraper.tokens.ts # UrlScraperToken
```

Изменения в существующих файлах:
- `src/modules/import-jobs/services/import-job.service.interface.ts` — добавить `importFromUrl`
- `src/modules/import-jobs/services/import-job.service.ts` — реализовать `importFromUrl`
- `src/modules/bot/recipe-bot.ts` — URL-детекция в `onText`
- `src/container.ts` — зарегистрировать `UrlScraperToken → CheerioScraper`

## CheerioScraper

Fetch с заголовком `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36`.

Стратегия извлечения текста:
1. Читаем `<meta property="og:description">` — работает для Instagram, YouTube, большинства recipe-сайтов
2. Если `og:description` короче 200 символов — fallback: `$('body').text()` без `script`/`style`/`nav`/`footer`/`header`, trim, обрезаем до 8000 символов

Если `fetch` вернул не-2xx — бросаем `Error` с кодом статуса.

## URL Detection in RecipeBot

В `onText` перед вызовом `importFromText`:

```typescript
const URL_REGEX = /https?:\/\/\S+/
if (URL_REGEX.test(text)) {
  return this.service.importFromUrl(text.trim())
}
```

Сообщения бота:
- `⏳ Скачиваю страницу и обрабатываю...`
- `✅ Рецепт сохранён!\n<webUrl>/recipes/<id>`
- `❌ Не удалось извлечь рецепт: <error>`

## Error Handling

| Ситуация | Поведение |
|---|---|
| Сайт вернул 4xx/5xx | `scrape()` бросает ошибку → `importFromUrl` пишет `status: failed` с читаемым сообщением |
| OG и body пустые / нет рецепта | DeepSeek вернёт невалидный JSON → Zod кинет ошибку → `status: failed` |
| Закрытый Instagram-аккаунт | `og:description` пустой → fallback body тоже пустой → `status: failed` |

## Dependencies

- `cheerio` — `pnpm add cheerio`, `pnpm add -D @types/cheerio` (если нужны)
- `@types/cheerio` — встроены в пакет начиная с cheerio 1.x, отдельно не нужны

Системных зависимостей нет. yt-dlp не используется.

## Tests

- `CheerioScraper` — мок `fetch`: проверяем приоритет OG над body, fallback при коротком OG, ошибку при 4xx
- `ImportJobService.importFromUrl` — мок скрапера + мок парсера: проверяем `done`/`failed` статусы
- URL-детекция в `RecipeBot` — юнит-тест: URL → `importFromUrl`, plain text → `importFromText`
