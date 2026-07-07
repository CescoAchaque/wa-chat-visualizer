let elencoMediaInChat = [];
let indiceMediaCorrente = -1;

const NOMI_MESI = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

// Funzione di utilità per sanificare il testo
function escapeHtml(text) {
    if (!text) return "";
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, function (m) { return map[m]; });
}

function aggiornaStatoCaricamento(testo, percentuale) {
    const txtEl = document.getElementById('progress-text');
    const barEl = document.getElementById('progress-bar');
    if (txtEl) txtEl.innerText = `${testo} (${percentuale}%)`;
    if (barEl) barEl.style.width = `${percentuale}%`;
}

function aggiornaStatoRendering(percentuale) {
    const txtEl = document.getElementById('render-text');
    const barEl = document.getElementById('render-bar');
    if (txtEl) txtEl.innerText = `Ottimizzazione layout browser... (${percentuale}%)`;
    if (barEl) barEl.style.width = `${percentuale}%`;
}

// !!! QUESTA PARTE RISOLVE L'ERRORE DELLA CONSOLE !!!
// Aspetta che la pagina HTML sia completamente pronta e renderizzata dal browser
document.addEventListener('DOMContentLoaded', function () {

    const inputElement = document.getElementById('file-input');

    // Controllo di sicurezza se l'ID nell'HTML non dovesse coincidere
    if (!inputElement) {
        console.error("ERRORE: Non ho trovato nessun elemento con id='file-input' nel file HTML. Verifica i tag!");
        return;
    }

    // Colleghiamo l'evento in totale sicurezza
    inputElement.onchange = async function (e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const fileScelto = files[0];

        if (!fileScelto.name.toLowerCase().endsWith('.zip')) {
            alert("Per favore, seleziona un file in formato .zip (l'archivio originale esportato da WhatsApp).");
            return;
        }

        const progContainer = document.getElementById('progress-container');
        const renderBox = document.getElementById('render-progress-box');
        if (progContainer) progContainer.classList.remove('hidden');
        if (renderBox) renderBox.classList.add('hidden');

        aggiornaStatoCaricamento("Inizializzazione archivio ZIP...", 5);

        try {
            if (typeof JSZip === 'undefined') {
                throw new Error("La libreria JSZip.min.js non è stata caricata. Verifica il tag <script> nel tuo HTML.");
            }

            const zip = new JSZip();
            const zipContenuto = await zip.loadAsync(fileScelto);

            const tutteLeChiavi = Object.keys(zipContenuto.files);
            const txtFileKey = tutteLeChiavi.find(name => name.toLowerCase().endsWith('.txt') && !name.startsWith('__MACOSX/'));

            if (!txtFileKey) {
                alert("Impossibile trovare il file .txt della chat all'interno dello ZIP!");
                if (progContainer) progContainer.classList.add('hidden');
                return;
            }

            const nomeChatPulito = txtFileKey.replace('.txt', '').replace(/_/g, ' ');
            const titleTextEl = document.getElementById('chat-title-text');
            if (titleTextEl) titleTextEl.innerText = nomeChatPulito;

            aggiornaStatoCaricamento("Estrazione e mappatura dei file multimediali...", 20);

            const mediaMap = {};

            for (const nomeFile of tutteLeChiavi) {
                const fileZip = zipContenuto.files[nomeFile];

                if (fileZip.dir || nomeFile.startsWith('__MACOSX/') || nomeFile.toLowerCase().endsWith('.txt')) {
                    continue;
                }

                const blob = await fileZip.async("blob");
                mediaMap[nomeFile.trim()] = URL.createObjectURL(blob);
            }

            aggiornaStatoCaricamento("Lettura e decodifica del testo dei messaggi...", 50);

            const textContent = await zipContenuto.files[txtFileKey].async("string");

            elencoMediaInChat = [];
            avviaParsingProgressivo(textContent, mediaMap);

        } catch (errore) {
            console.error("Errore irreversibile durante l'estrazione dello ZIP:", errore);
            alert("Si è verificato un errore nel leggere il file ZIP: " + errore.message);
            if (progContainer) progContainer.classList.add('hidden');
        }
    };
});


function avviaParsingProgressivo(text, mediaMap) {
    const lines = text.split('\n');
    const totaleRighe = lines.length;
    const chatBody = document.getElementById('chat-body');
    const timelineLinks = document.getElementById('timeline-links');

    chatBody.innerHTML = '';
    timelineLinks.innerHTML = '';

    const regex = /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\s]*(\d{1,2}:\d{2})(?::\d{2})?\]?\s*(?:-\s*)?([^:]+):\s(.*)$/;
    const mediaRegex = /([\w\.\-]+?\.(?:jpg|jpeg|png|gif|opus|aac|mp4|mov|3gp|webp|pdf|docx|doc|xlsx|xls|pptx|ppt|zip)(?:\.pdf|\.jpg|\.png)?)/i;


    let primoAutore = null;
    let ultimoMsgContenitore = null;
    let ultimaDataRilevata = "";
    let mappaMesiAnni = {};

    let rigaCorrente = 0;
    const dimensioneBlocco = 200;

    function elaboraProssimoBlocco() {
        const fineBlocco = Math.min(rigaCorrente + dimensioneBlocco, totaleRighe);
        const bloccoFragment = document.createDocumentFragment();

        for (let i = rigaCorrente; i < fineBlocco; i++) {
            const line = lines[i];
            const match = line.match(regex);

            if (match) {
                let [_, giorno, mese, anno, ora, autore, messaggio] = match;
                if (!primoAutore) primoAutore = autore;

                // Pulisce il messaggio dai tag di sistema di WhatsApp che bloccano il recupero dei media
                messaggio = messaggio.replace('<Questo messaggio è stato modificato>', '')
                    .replace('<Media omessi>', '')
                    .trim();

                const dataChiave = `${giorno}/${mese}/${anno}`;

                if (dataChiave !== ultimaDataRilevata) {
                    ultimaDataRilevata = dataChiave;
                    const dateDiv = document.createElement('div');
                    dateDiv.className = 'date-divider';

                    let annoQuattroCifre = anno;
                    if (annoQuattroCifre.length === 2) annoQuattroCifre = '20' + annoQuattroCifre;

                    const indiceMese = parseInt(mese, 10) - 1;
                    const nomeMese = (indiceMese >= 0 && indiceMese < 12) ? NOMI_MESI[indiceMese] : mese;
                    const dataTestoEsteso = `${parseInt(giorno, 10)} ${nomeMese} ${annoQuattroCifre}`;

                    dateDiv.innerText = dataTestoEsteso;
                    const idData = `data-${giorno}-${mese}-${annoQuattroCifre}`;
                    dateDiv.id = idData;
                    bloccoFragment.appendChild(dateDiv);

                    const nomeMeseAnnoNav = `${nomeMese} ${annoQuattroCifre}`;
                    if (!mappaMesiAnni[nomeMeseAnnoNav]) {
                        mappaMesiAnni[nomeMeseAnnoNav] = idData;
                    }
                }

                const typeClass = (autore === primoAutore) ? 'sent' : 'received';
                const msgDiv = document.createElement('div');
                msgDiv.className = `message ${typeClass}`;
                msgDiv.innerHTML = `
                    <div class="author">${escapeHtml(autore)}</div>
                    <div class="text-content"></div>
                    <div class="meta">${dataChiave} ${ora}</div>
                `;
                bloccoFragment.appendChild(msgDiv);

                const textContentDiv = msgDiv.querySelector('.text-content');
                ultimoMsgContenitore = textContentDiv;

                try {
                    const mediaMatch = messaggio.match(mediaRegex);
                    let mediaTrovato = false;

                    if (mediaMatch) {
                        const nomeFile = mediaMatch[1].trim();
                        const localMediaUrl = mediaMap[nomeFile];

                        if (localMediaUrl) {
                            const ext = nomeFile.split('.').pop().toLowerCase();

                            if (['opus', 'aac'].includes(ext)) {
                                textContentDiv.innerHTML = `<span style="font-style:italic; display:block; margin-bottom:5px;">Nota vocale</span><audio controls src="${localMediaUrl}" style="max-width: 100%;" preload="none"></audio>`;
                            } else if (['mp4', 'mov', '3gp'].includes(ext)) {
                                textContentDiv.innerHTML = `
                                    <div class="video-container" style="position:relative; min-height:200px; background:#111b21;">
                                        <video controls src="${localMediaUrl}" preload="none" style="width:100%; display:block;"></video>
                                        <button class="zoom-media-btn" style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.6); color:#fff; border:none; padding:5px 8px; border-radius:4px; cursor:pointer; z-index:10;">🔍 Espandi</button>
                                    </div>`;

                                const idMedia = elencoMediaInChat.length;
                                elencoMediaInChat.push({ url: localMediaUrl, tipo: 'video', nome: nomeFile, data: dataChiave, ora: ora, autore: autore });

                                textContentDiv.querySelector('.zoom-media-btn').addEventListener('click', function (e) {
                                    e.stopPropagation();
                                    apriPienoSchermo(idMedia);
                                });
                            } else if (ext === 'webp') {
                                msgDiv.classList.add('is-sticker');
                                textContentDiv.innerHTML = `<img src="${localMediaUrl}" alt="Sticker">`;
                            }
                            // GESTIONE NUOVO SISTEMA ALLEGATI E DOCUMENTI GENERICI
                            else if (['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'zip'].includes(ext)) {
                                let iconaDoc = "📄";
                                if (ext === "pdf") iconaDoc = "📕";
                                else if (['docx', 'doc'].includes(ext)) iconaDoc = "📘";
                                else if (['xlsx', 'xls'].includes(ext)) iconaDoc = "📗";
                                else if (ext === "zip") iconaDoc = "📦";

                                textContentDiv.innerHTML = `
                                    <a href="${localMediaUrl}" download="${nomeFile}" target="_blank" class="document-attachment-btn" style="display: flex; align-items: center; background: rgba(0, 0, 0, 0.2); padding: 10px; border-radius: 6px; text-decoration: none; color: inherit; border: 1px solid rgba(255,255,255,0.05); margin-top: 4px;">
                                        <span style="font-size: 24px; margin-right: 12px; line-height: 1;">${iconaDoc}</span>
                                        <div style="display: flex; flex-direction: column; overflow: hidden; text-align: left;">
                                            <span style="font-size: 14px; font-weight: bold; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; color: #53bdeb;">${escapeHtml(nomeFile)}</span>
                                            <span style="font-size: 11px; color: #8696a0; margin-top: 2px;">Apri o scarica il file</span>
                                        </div>
                                    </a>`;
                            }
                            else {
                                textContentDiv.innerHTML = `<img src="${localMediaUrl}" alt="Media" style="min-height:200px; background:#111b21; cursor:pointer; display:block; max-width:100%;">`;

                                const idMedia = elencoMediaInChat.length;
                                elencoMediaInChat.push({ url: localMediaUrl, tipo: 'image', nome: nomeFile, data: dataChiave, ora: ora, autore: autore });

                                textContentDiv.querySelector('img').addEventListener('click', function () {
                                    apriPienoSchermo(idMedia);
                                });
                            }
                            mediaTrovato = true;
                        }
                    }

                    if (!mediaTrovato) {
                        textContentDiv.innerHTML = convertiTestoInLink(escapeHtml(messaggio));
                    }
                } catch (mediaError) {
                    console.error(mediaError);
                    textContentDiv.innerHTML = convertiTestoInLink(escapeHtml(messaggio));
                }

            } else if (ultimoMsgContenitore && line.trim() !== '') {
                let rigaPulita = line.replace('<Questo messaggio è stato modificato>', '');
                if (rigaPulita.trim() !== '') {
                    ultimoMsgContenitore.innerHTML += '<br>' + convertiLinkEAnteprime(escapeHtml(rigaPulita));
                }
            }
        }

        chatBody.appendChild(bloccoFragment);
        rigaCorrente = fineBlocco;

        const percentualeAnalisi = Math.floor((rigaCorrente / totaleRighe) * 100);
        aggiornaStatoCaricamento("Analisi messaggi...", percentualeAnalisi);
        aggiornaStatoRendering(percentualeAnalisi);

        if (rigaCorrente < totaleRighe) {
            setTimeout(elaboraProssimoBlocco, 4);
        } else {
            aggiornaStatoCaricamento("Calendario finale...", 100);
            aggiornaStatoRendering(100);

            const navFragment = document.createDocumentFragment();
            for (const periodo in mappaMesiAnni) {
                const btn = document.createElement('button');
                btn.className = 'timeline-btn';
                btn.title = periodo;
                btn.innerText = periodo;

                btn.onclick = function () {
                    const elementoTarget = document.getElementById(mappaMesiAnni[periodo]);
                    if (elementoTarget) elementoTarget.scrollIntoView();
                };
                navFragment.appendChild(btn);
            }
            timelineLinks.appendChild(navFragment);

            setTimeout(() => {
                document.getElementById('upload-section').classList.add('hidden');
                document.getElementById('chat-screen').classList.remove('hidden'); initControls();
            }, 600);
        }
    }
    elaboraProssimoBlocco();
}


function apriPienoSchermo(indice) {
    if (indice < 0 || indice >= elencoMediaInChat.length) return;
    indiceMediaCorrente = indice;
    const lightbox = document.getElementById('lightbox');
    const content = document.getElementById('lightbox-content');
    const caption = document.getElementById('lightbox-caption');
    const media = elencoMediaInChat[indice];

    if (media.tipo === 'video') {
        content.innerHTML = `<video src="${media.url}" controls autoplay loop style="max-width:100%; max-height:100%;"></video>`;
    } else {
        content.innerHTML = `<img src="${media.url}" alt="Media pieno schermo" style="max-width:100%; max-height:100%;">`;
    }

    caption.innerHTML = `Inviato da: <strong>${escapeHtml(media.autore)}</strong> <span>Il ${media.data} alle ${media.ora}</span> <br> <small style="color:#8696a0; font-size:11px;">File: ${escapeHtml(media.nome)}</small>`;
    lightbox.classList.remove('hidden');
}

function navigaMedia(direzione, evento) {
    if (evento) evento.stopPropagation();
    let nuovoIndice = indiceMediaCorrente + direzione;
    if (nuovoIndice >= 0 && nuovoIndice < elencoMediaInChat.length) {
        apriPienoSchermo(nuovoIndice);
    }
}

function chiudiLightbox() {
    const lightbox = document.getElementById('lightbox');
    document.getElementById('lightbox-content').innerHTML = '';
    document.getElementById('lightbox-caption').innerHTML = '';
    lightbox.classList.add('hidden');
}

function initControls() {
    const slider = document.getElementById('zoom-slider');
    if (slider) {
        slider.addEventListener('input', function () {
            const size = this.value + 'px';
            document.querySelectorAll('.message').forEach(msg => msg.style.fontSize = size);
        });
    }

    // --- STRUTTURA OTTIMIZZATA: RICERCA TESTUALE IN TEMPO REALE ---
    const searchInput = document.getElementById('chat-search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const termine = this.value.toLowerCase().trim();
            const tuttiIMessaggi = document.querySelectorAll('.message');

            // Passo 1: Nascondi o mostra i messaggi in un unico ciclo veloce
            tuttiIMessaggi.forEach(msg => {
                const txt = msg.querySelector('.text-content').innerText.toLowerCase();
                const auth = msg.querySelector('.author').innerText.toLowerCase();

                if (termine === "" || txt.includes(termine) || auth.includes(termine)) {
                    msg.classList.remove('hidden');
                } else {
                    msg.classList.add('hidden');
                }
            });

            // Passo 2: Ottimizzazione divisori date senza loop infiniti di lettura
            // Invece di fare i cicli While su ogni data, cerchiamo direttamente i divisori
            const divisori = document.querySelectorAll('.date-divider');
            divisori.forEach(div => {
                if (termine === "") {
                    div.classList.remove('hidden');
                    return;
                }

                // Controlliamo i messaggi successivi fino al prossimo divisore
                let prox = div.nextElementSibling;
                let visibile = false;
                while (prox && !prox.classList.contains('date-divider')) {
                    if (prox.classList.contains('message') && !prox.classList.contains('hidden')) {
                        visibile = true;
                        break; // Trovato un messaggio visibile, possiamo fermarci subito!
                    }
                    prox = prox.nextElementSibling;
                }

                if (visibile) div.classList.remove('hidden');
                else div.classList.add('hidden');
            });
        });
    }

    // --- STRUTTURA OTTIMIZZATA: MINIMIZZAZIONE CALENDARIO PC ---
    const toggleTimelineBtn = document.getElementById('toggle-timeline');
    const timelineNav = document.getElementById('timeline-nav');
    if (toggleTimelineBtn && timelineNav) {
        toggleTimelineBtn.addEventListener('click', function () {
            timelineNav.classList.toggle('minimized');
            const isMin = timelineNav.classList.contains('minimized');
            this.textContent = isMin ? '➡️' : '📅';

            // Ottimizzazione: pre-calcoliamo le modifiche prima di applicarle ai bottoni
            const bottoni = document.querySelectorAll('.timeline-btn');

            // Usiamo DocumentFragment per non stressare il browser se ci sono molti mesi
            bottoni.forEach(btn => {
                if (!btn.title) btn.title = btn.innerText;

                if (isMin) {
                    const parti = btn.title.split(' ');
                    const meseCorto = parti[0] ? parti[0].substring(0, 3) : '';
                    const annoCorto = parti[1] ? parti[1].substring(parti[1].length - 2) : '';
                    btn.innerText = `${meseCorto} ${annoCorto}`;
                } else {
                    btn.innerText = btn.title;
                }
            });
        });
    }

    const darkBtn = document.getElementById('dark-mode-toggle');
    if (darkBtn) {
        const newDarkBtn = darkBtn.cloneNode(true);
        darkBtn.parentNode.replaceChild(newDarkBtn, darkBtn);
        newDarkBtn.addEventListener('click', function () {
            document.body.classList.toggle('dark-theme');
            this.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
        });
    }

    const backBtn = document.getElementById('back-to-upload');
    if (backBtn) {
        backBtn.onclick = function () {
            document.getElementById('file-input').value = "";
            document.getElementById('progress-container').classList.add('hidden');
            document.getElementById('chat-screen').classList.add('hidden');
            document.getElementById('upload-section').classList.remove('hidden');
        };
    }

    document.onkeydown = function (e) {
        const lightbox = document.getElementById('lightbox');
        if (!lightbox.classList.contains('hidden')) {
            if (e.key === 'Escape') chiudiLightbox();
            if (e.key === 'ArrowRight') navigaMedia(1);
            if (e.key === 'ArrowLeft') navigaMedia(-1);
        }
    };
}


function convertiTestoInLink(testo) {
    if (!testo) return '';

    // Regex per trovare tutti gli URL che iniziano con http o https
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Convertiamo i link di testo in tag <a> cliccabili
    let testoModificato = testo.replace(urlRegex, function (url) {
        return `<a href="${url}" target="_blank" class="chat-link">${url}</a>`;
    });

    // --- GENERATORE DI ANTEPRIME INTELLIGENTI ---
    const matchUrl = testo.match(urlRegex);
    if (matchUrl) {
        const urlPuro = matchUrl[0].toLowerCase();
        let anteprimaHtml = '';

        if (urlPuro.includes('youtube.com') || urlPuro.includes('youtu.be')) {
            anteprimaHtml = `<div class="link-preview-box"> 📺 <strong>YouTube</strong><br>Video o Canale multimediale</div>`;
        } else if (urlPuro.includes('instagram.com')) {
            anteprimaHtml = `<div class="link-preview-box"> 📸 <strong>Instagram</strong><br>Post, Reel o Profilo social</div>`;
        } else if (urlPuro.includes('spotify.com')) {
            anteprimaHtml = `<div class="link-preview-box"> 🎵 <strong>Spotify</strong><br>Brano musicale, Playlist o Podcast</div>`;
        } else if (urlPuro.includes('wikipedia.org')) {
            anteprimaHtml = `<div class="link-preview-box"> 📚 <strong>Wikipedia</strong><br>Enciclopedia libera online</div>`;
        } else if (urlPuro.includes('.it') || urlPuro.includes('.com') || urlPuro.includes('.org')) {
            // Estrae il nome del dominio per renderlo pulito
            try {
                const dominio = urlPuro.split('/')[2].replace('www.', '');
                anteprimaHtml = `<div class="link-preview-box"> <strong>Collegamento 🌐 Esterno</strong><br>Visita il sito: ${dominio}</div>`;
            } catch (e) {
                anteprimaHtml = `<div class="link-preview-box"> <strong>Collegamento 🌐 Esterno</strong><br>Visita il link allegato</div>`;
            }
        }

        testoModificato += anteprimaHtml;
    }

    return testoModificato;
}

function convertiLinkEAnteprime(testo) {
    if (!testo) return '';

    const urlRegex = /(https?:\/\/[^\s]+)/g;

    return testo.replace(urlRegex, function (url) {
        let anteprimaHtml = '';

        if (url.includes('maps.google') || url.includes('maps.app.goo.gl') || url.includes('/maps/')) {
            anteprimaHtml = `
            <div class="link-preview-box" style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-left: 3px solid #ea4335; border-radius: 4px; font-size: 13px;">
                <div style="font-weight: bold; color: #ea4335; margin-bottom: 3px;">📍 Posizione Google Maps</div>
                <div style="color: #8696a0; font-size: 11px; word-break: break-all;">${url}</div>
            </div>`;
        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            anteprimaHtml = `
            <div class="link-preview-box" style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-left: 3px solid #ff0000; border-radius: 4px; font-size: 13px;">
                <div style="font-weight: bold; color: #ff0000; margin-bottom: 3px;">📺 Video di YouTube</div>
                <div style="color: #8696a0; font-size: 11px; word-break: break-all;">${url}</div>
            </div>`;
        }

        return `<a href="${url}" target="_blank" style="color: #53bdeb; text-decoration: underline; word-break: break-all;">${url}</a>${anteprimaHtml}`;
    });
}