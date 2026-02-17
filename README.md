# OpenClaw Cases

Ежедневная подборка лучших кейсов использования OpenClaw.  
EN + RU версии, автоматическое обновление.

## Структура

```
├── index.html              # EN главная
├── en/index.html           # EN (дубль)
├── ru/index.html           # RU главная
├── case/*.html             # EN страницы кейсов
├── ru/case/*.html          # RU страницы кейсов
├── data/cases.json         # Данные (источник правды)
├── generate.js             # Генератор HTML из JSON
└── scripts/parse-cases.js  # Парсер новых кейсов
```

## Локальный запуск

```bash
cd ~/.openclaw/workspace/labs/openclaw-cases
python3 -m http.server 8080
# http://localhost:8080 (EN)
# http://localhost:8080/ru/ (RU)
```

## Автоматизация

### Источники парсинга:
- **GitHub** — awesome-openclaw-usecases (основной)
- **Twitter/X** — поиск "openclaw"
- **Reddit** — r/AI_Agents

### Cron (ежедневно 10:00 МСК / 14:00 VN):
```
1. node scripts/parse-cases.js  — парсинг
2. node generate.js             — генерация HTML
3. git push                     — автодеплой
```

### Ручное обновление:
```bash
node scripts/parse-cases.js  # парсит + генерит
```

## Деплой

- **Production**: TBD (Cloudflare Pages + домен)
- **Preview**: http://192.168.1.101:8080
