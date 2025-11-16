const { addonBuilder, serveHTTP } = require('stremio-addon-sdk')
const fetch = require('node-fetch')
const srtParser2 = require('srt-parser-2')

const manifest = {
    id: 'org.arabic.autotranslator',
    version: '1.0.0',
    name: 'Arabic Auto Translate Subtitles',
    description: 'Translate subtitles on the fly using LibreTranslate',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
}

const builder = new addonBuilder(manifest)
const parser = new srtParser2()

// تخزين ملفات SRT مترجمة مؤقتاً بالذاكرة مع مفتاح معرف
const translatedSubsStorage = {}

async function translateText(text) {
    const res = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            q: text,
            source: 'auto',
            target: 'ar',
            format: 'text'
        })
    })
    const json = await res.json()
    return json.translatedText || text
}

async function translateSrt(srtText) {
    const captions = parser.fromSrt(srtText)
    for (let i = 0; i < captions.length; i++) {
        captions[i].text = await translateText(captions[i].text)
    }
    return parser.toSrt(captions)
}

builder.defineSubtitlesHandler(async ({ extra }) => {
    const srtUrl = extra && extra.subtitleUrl ? extra.subtitleUrl : null
    if (!srtUrl) {
        return { subtitles: [] }
    }

    const res = await fetch(srtUrl)
    if (!res.ok) {
        return { subtitles: [] }
    }
    const srtText = await res.text()
    const translatedSrt = await translateSrt(srtText)

    // حفظ الترجمة في التخزين المؤقت
    const subId = 'translated-' + Date.now()
    translatedSubsStorage[subId] = translatedSrt

    // إرجاع رابط داخلي endpoint لاسترجاع الترجمة
    const url = `https://stremio-ar-subs.onrender.com/subtitles/${subId}.srt`

    return {
        subtitles: [
            {
                id: subId,
                lang: 'ar',
                name: 'Arabic Auto-Translated Subtitles',
                url
            }
        ]
    }
})

// خدمة ملف SRT المترجم من الذاكرة
const express = require('express')
const app = express()

app.get('/subtitles/:id.srt', (req, res) => {
    const subId = req.params.id
    const srtData = translatedSubsStorage[subId]
    if (!srtData) {
        res.status(404).send('Subtitle not found')
        return
    }
    res.set('Content-Type', 'text/plain; charset=utf-8')
    res.send(srtData)
})

// دمج Express مع Stremio Addon SDK
const addonInterface = builder.getInterface()
app.use('/', addonInterface)

const PORT = process.env.PORT || 7000
app.listen(PORT, () => {
    console.log(`Addon running on port ${PORT}`)
    console.log(`Use manifest at http://localhost:${PORT}/manifest.json`)
})
