const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const manifest = require('./manifest.json');
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.json(manifest));
app.get('/manifest.json', (req, res) => res.json(manifest));

app.get('/subtitles/:type/:id/:extra?.json', async (req, res) => {
    const { type, id, extra } = req.params;
    const idParts = id.split(':');
    const imdbId = idParts[0]; 
    const season = idParts[1] || null;
    const episode = idParts[2] || null;

    let videoFilename = "";
    if (extra) {
        const extraParts = Object.fromEntries(new URLSearchParams(extra));
        if (extraParts.filename) videoFilename = decodeURIComponent(extraParts.filename).toLowerCase();
    }

    let allSubtitles = [];

    try {
        const results = await Promise.allSettled([
            fetchFromSubSource(imdbId, season, episode, videoFilename),
            fetchFromOpenSubtitles(imdbId, season, episode, videoFilename),
            fetchFromSubdl(imdbId, season, episode, videoFilename)
        ]);

        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                allSubtitles = allSubtitles.concat(result.value);
            }
        });
    } catch (error) {
        console.error("Error fetching subtitles:", error.message);
    }

    res.json({ subtitles: allSubtitles });
});

async function fetchFromSubSource(imdbId, season, episode, filename) {
    try {
        const response = await axios.get(`https://api.subsource.net/api/v1/subtitles`, {
            params: { imdb_id: imdbId, lang: 'ar' },
            headers: { 'Authorization': `Bearer ${process.env.SUBSOURCE_API_KEY}` },
            timeout: 4000
        });
        return response.data.map(sub => ({
            url: sub.download_url,
            lang: "ara",
            label: `[SubSource] العربية - ${sub.release_group || 'نسخة عامة'}`
        }));
    } catch (e) { return []; }
}

async function fetchFromOpenSubtitles(imdbId, season, episode, filename) {
    try {
        const response = await axios.get(`https://api.opensubtitles.com/api/v1/subtitles`, {
            params: { imdb_id: imdbId.replace('tt', ''), languages: 'ar', type: season ? 'episode' : 'movie', season_number: season, episode_number: episode },
            headers: { 
                'Api-Key': process.env.OPENSUBTITLES_API_KEY,
                'User-Agent': 'StremioMultiSubs v1.0'
            },
            timeout: 4000
        });
        return response.data.data.map(item => ({
            url: `https://api.opensubtitles.com/api/v1/download`, 
            lang: "ara",
            label: `[OpenSubs] العربية - ${item.attributes.release || 'نسخة عامة'}`
        }));
    } catch (e) { return []; }
}

async function fetchFromSubdl(imdbId, season, episode, filename) {
    try {
        const response = await axios.get(`https://api.subdl.com/api/v1/subtitles`, {
            params: { imdb_id: imdbId, languages: 'ar', api_key: process.env.SUBDL_API_KEY },
            timeout: 4000
        });
        if (response.data.status && response.data.subtitles) {
            return response.data.subtitles.map(sub => ({
                url: sub.url,
                lang: "ara",
                label: `[Subdl] العربية - ${sub.release_name || 'نسخة عامة'}`
            }));
        }
        return [];
    } catch (e) { return []; }
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
