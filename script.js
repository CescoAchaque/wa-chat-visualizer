let elencoMediaInChat = [];
let indiceMediaCorrente = -1;

const NOMI_MESI = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

document.getElementById('file-input').addEventListener('change', function (e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const txtFile = files.find(file => file.name.endsWith('.txt'));
    if (!txtFile) {
        alert("Non hai selezionato il file .txt della chat!");
        return;
    }

    const nomeChatPulito = txtFile.name.replace('.txt', '').replace(/_/g, ' ');
    document.getElementById('chat-title-text').innerText = nomeChatPulito;

    document.getElementById('progress-container').classList.remove('hidden');
    document.getElementById('render-progress-box').classList.add('hidden'); // Reset barra 2
    aggiornaStatoCaricamento("Mappatura dei media...", 5);

    const mediaMap = {};
    files.forEach(file => {
        if (!file.name.endsWith('.txt')) {
            mediaMap[file.name.trim()] = URL.createObjectURL(file);
        }
    });

    const reader = new FileReader();
    reader.onload = function (event) {
        const textContent = event.target.result;
        elencoMediaInChat = [];
        avviaParsingProgressivo(textContent, mediaMap);
    };
    reader.readAsText(txtFile);
});

function aggiornaStatoCaricamento(testo, percentuale) {
    document.getElementById('progress-text').innerText = `${testo} (${percentuale}%)`;
    document.getElementById('progress-bar').style.width = `${percentuale}%`;
}

function aggiornaStatoRendering(percentuale) {
    document.getElementById('render-text').innerText = `Ottimizzazione layout browser... (${percentuale}%)`;
    document.getElementById('render-bar').style.width = `${percentuale}%`;
}

function avviaParsingProgressivo(text, mediaMap) {
    const lines = text.split('\n');
    const totaleRighe = lines.length;
    const chatBody = document.getElementById('chat-body');
    const timelineLinks = document.getElementById('timeline-links');

    chatBody.innerHTML = '';
    timelineLinks.innerHTML = '';

    const regex = /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\s]*(\d{1,2}:\d{2})(?::\d{2})?\]?\s*(?:-\s*)?([^:]+):\s(.*)$/;
    const mediaRegex = /([\w\.\-]+?\.(?:jpg|jpeg|png|gif|opus|aac|mp4|mov|3gp|webp))/i;

    let primoAutore = null;
    let ultimoMsgContenitore = null;
    let ultimaDataRilevata = "";
    let mappaMesiAnni = {};

    let rigaCorrente = 0;
    // Portiamo la dimensione a 200 per velocizzare i tempi di calcolo visivo del rendering
    const dimensioneBlocco = 200;

    document.getElementById('render-progress-box').classList.remove('hidden');

    function elaboraProssimoBlocco() {
        const fineBlocco = Math.min(rigaCorrente + dimensioneBlocco, totaleRighe);
        const bloccoFragment = document.createDocumentFragment();

        for (let i = rigaCorrente; i < fineBlocco; i++) {
            const line = lines[i];
            const match = line.match(regex);

            if (match) {
                let [_, giorno, mese, anno, ora, autore, messaggio] = match;
                if (!primoAutore) primoAutore = autore;

                messaggio = messaggio.replace('<Questo messaggio è stato modificato>', '').trim();
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
                    <div class="author">${autore}</div>
                    <div class="text-content"></div>
                    <div class="meta">${dataChiave} ${ora}</div>
                `;
                bloccoFragment.appendChild(msgDiv);

                const textContentDiv = msgDiv.querySelector('.text-content');
                ultimoMsgContenitore = textContentDiv;

                // --- SISTEMA REPERIMENTO FILE OTTIMIZZATO SENZA BUG ---
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
                                // Rimosso loading=lazy instabile e sostituito con ingombro fisso per evitare i buchi nello scroll
                                textContentDiv.innerHTML = `<video controls src="${localMediaUrl}" preload="none" style="min-height:200px; background:#111b21;"></video>`;

                                const idMedia = elencoMediaInChat.length;
                                elencoMediaInChat.push({ url: localMediaUrl, tipo: 'video', nome: nomeFile, data: dataChiave, ora: ora, autore: autore });

                                textContentDiv.querySelector('video').addEventListener('click', function (e) {
                                    e.preventDefault();
                                    apriPienoSchermo(idMedia);
                                });
                            } else if (ext === 'webp') {
                                msgDiv.classList.add('is-sticker');
                                textContentDiv.innerHTML = `<img src="${localMediaUrl}" alt="Sticker">`;
                            } else {
                                // Dimensione minima e sfondo per evitare salti grafici e buchi nella chat durante lo scorrimento
                                textContentDiv.innerHTML = `<img src="${localMediaUrl}" alt="Media" style="min-height:200px; background:#111b21;">`;

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
                        // MODIFICA: Usiamo innerHTML e passiamo il testo alla nostra nuova funzione link
                        textContentDiv.innerHTML = convertiTestoInLink(escapeHtml(messaggio));
                    } else if (ultimoMsgContenitore && line.trim() !== '') {
                        let rigaPulita = line.replace('<Questo messaggio è stato modificato>', '');
                        if (rigaPulita.trim() !== '') {
                            // Sostituisci la vecchia riga con questa per convertire i link anche nei testi a capo
                            ultimoMsgContenitore.innerHTML += '<br>' + convertiLinkEAnteprime(escapeHtml(rigaPulita));
                        }
                    }
                    
                } catch (mediaError) {
                    console.error("Errore riga media:", mediaError);
                    textContentDiv.innerText = messaggio;
                }

            } else if (ultimoMsgContenitore && line.trim() !== '') {
                let rigaPulita = line.replace('<Questo messaggio è stato modificato>', '');
                if (rigaPulita.trim() !== '') {
                    // MODIFICA: Applica la conversione dei link anche ai testi a capo
                    ultimoMsgContenitore.innerHTML += '<br>' + convertiTestoInLink(escapeHtml(rigaPulita));
                }
            }
        }

        chatBody.appendChild(bloccoFragment);
        rigaCorrente = fineBlocco;

        const percentualeAnalisi = Math.floor((rigaCorrente / totaleRighe) * 100);
        aggiornaStatoCaricamento("Analisi del testo dei messaggi...", percentualeAnalisi);
        aggiornaStatoRendering(percentualeAnalisi);

        if (rigaCorrente < totaleRighe) {
            // Abbassato a 4ms per rendere la doppia barra di caricamento iniziale estremamente reattiva e veloce
            setTimeout(elaboraProssimoBlocco, 4);
        } else {
            aggiornaStatoCaricamento("Scrittura del calendario finale...", 100);
            aggiornaStatoRendering(100);

            const navFragment = document.createDocumentFragment();
            for (const periodo in mappaMesiAnni) {
                const btn = document.createElement('button');
                btn.className = 'timeline-btn';
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
                document.getElementById('chat-screen').classList.remove('hidden');
                initControls();
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
        content.innerHTML = `<video src="${media.url}" controls autoplay loop></video>`;
    } else {
        content.innerHTML = `<img src="${media.url}" alt="Media pieno schermo">`;
    }

    caption.innerHTML = `Inviato da: <strong>${media.autore}</strong> <span>Il ${media.data} alle ${media.ora}</span> <br> <small style="color:#8696a0; font-size:11px;">File: ${media.nome}</small>`;
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
            document.getElementById('chat-title-text').innerText = "Visualizzatore Chat";
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

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Nuova funzione per intercettare i link e creare l'anteprima
function convertiTestoInLink(testo) {
    if (!testo) return '';

    // Regex per trovare tutti gli URL che iniziano con http o https
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Convertiamo i link di testo in tag <a> cliccabili
    let testoModificato = testo.replace(urlRegex, function (url) {
        return `<a href="${url}" target="_blank" class="chat-link">${url}</a>`;
    });

    // --- GENERATORE DI ANTEPRIME INTELLIGENTI ---
    // Cerchiamo se nel testo originale c'è un URL per capire se creare un box extra di anteprima
    const matchUrl = testo.match(urlRegex);
    if (matchUrl) {
        const urlPuro = matchUrl[0].toLowerCase();
        let anteprimaHtml = '';

        if (urlPuro.includes('youtube.com') || urlPuro.includes('youtu.be')) {
            anteprimaHtml = `<div class="link-preview-box">📺 <strong>YouTube</strong><br>Video o Canale multimediale</div>`;
        } else if (urlPuro.includes('instagram.com')) {
            anteprimaHtml = `<div class="link-preview-box">📸 <strong>Instagram</strong><br>Post, Reel o Profilo social</div>`;
        } else if (urlPuro.includes('spotify.com')) {
            anteprimaHtml = `<div class="link-preview-box">🎵 <strong>Spotify</strong><br>Brano musicale, Playlist o Podcast</div>`;
        } else if (urlPuro.includes('wikipedia.org')) {
            anteprimaHtml = `<div class="link-preview-box">📚 <strong>Wikipedia</strong><br>Enciclopedia libera online</div>`;
        } else if (urlPuro.includes('.it') || urlPuro.includes('.com') || urlPuro.includes('.org')) {
            // Anteprima generica per siti web (come quello di eventimilano.it del tuo screenshot)
            // Estrae il nome del dominio per renderlo pulito
            const dominio = urlPuro.split('/')[2].replace('www.', '');
            anteprimaHtml = `<div class="link-preview-box">🌐 <strong>Collegamento Esterno</strong><br>Visita il sito: ${dominio}</div>`;
        }

        testoModificato += anteprimaHtml;
    }

    return testoModificato;
}

// Funzione che rileva i link nel testo, li rende cliccabili e genera anteprime se sono mappe o video
function convertiLinkEAnteprime(testo) {
    if (!testo) return '';

    // Regex per intercettare qualsiasi URL che inizia con http o https
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    return testo.replace(urlRegex, function (url) {
        let anteprimaHtml = '';

        // 1. Anteprima speciale se si tratta di un link di GOOGLE MAPS
        if (url.includes('maps.google') || url.includes('maps.app.goo.gl') || url.includes('/maps/')) {
            anteprimaHtml = `
                <div class="link-preview-box" style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-left: 3px solid #ea4335; border-radius: 4px; font-size: 13px;">
                    <div style="font-weight: bold; color: #ea4335; margin-bottom: 3px;">📍 Posizione Google Maps</div>
                    <div style="color: #8696a0; font-size: 11px; word-break: break-all;">${url}</div>
                </div>
            `;
        }
        // 2. Anteprima speciale se si tratta di un video di YOUTUBE
        else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            anteprimaHtml = `
                <div class="link-preview-box" style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-left: 3px solid #ff0000; border-radius: 4px; font-size: 13px;">
                    <div style="font-weight: bold; color: #ff0000; margin-bottom: 3px;">📺 Video di YouTube</div>
                    <div style="color: #8696a0; font-size: 11px; word-break: break-all;">${url}</div>
                </div>
            `;
        }

        // Ritorna il link cliccabile + l'eventuale box di anteprima sotto
        return `<a href="${url}" target="_blank" style="color: #53bdeb; text-decoration: underline; word-break: break-all;">${url}</a>${anteprimaHtml}`;
    });
}

