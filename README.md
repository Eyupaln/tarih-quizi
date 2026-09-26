# Penaltı Düello

Mobil öncelikli, dokunmatik etkileşimli 1v1 penaltı düellosu prototipi.

## Brand system

Ana oyun ekranları `index.html`, `create-room.html`, `join-room.html`, `lobby.html` ve `game.html` aynı görsel kimlik sistemini kullanır: `assets/occ.png`, `#0B0C10`, `#1F2833`, `#2D1B4E`, `#F5F7FA`, `#00FF66`, `#FF6D00`, `#FFD600`, Bebas Neue, Inter ve Oswald. Tasarım kaynağı olarak yüklenen logo dosyaları ve mevcut oyun ekranları kullanılır; ayrı bir brand kit sayfası oluşturulmaz.

Logo kaynağı `assets/occ.png` dosyasıdır. Şeffaf dış boşluklar kırpılarak header'da `assets/penalti-duello-logo.png` adıyla kullanılır. Önceki görsel referans `ea741936-477e-4902-bc16-d10e2e39648f.png` dosyası da korunuyor.

## Marka sistemi

- Siyah / ana zemin: `#0B0C10`
- Derin gece mavisi / paneller: `#1F2833`
- Koyu mor / turnuva alanları: `#2D1B4E`
- Temiz beyaz / metin: `#F5F7FA`
- Neon yeşil / ana aksiyon: `#00FF66`
- Turuncu / ikincil vurgu: `#FF6D00`
- Sarı / uyarı ve sonuç vurgusu: `#FFD600`
- Display font: `Bebas Neue`
- UI font: `Inter`
- Skor / rakam fontu: `Oswald`

Gerçek para, bahis, casino veya gerçek ödül özellikleri kapsam dışıdır.

## Çalıştırma

Sayfalar arası `sessionStorage` akışını sorunsuz kullanmak için projeyi basit bir HTTP sunucusu üzerinden çalıştır:

```bash
npm install
npm start
```

Varsayılan olarak `http://localhost:3000` adresi açılır. Alternatif olarak:

```bash
npx serve .
```

Railway veya benzeri Node.js barındırma servislerinde `PORT` ortam değişkeni otomatik olarak kullanılır.

## Ekran akışı

- `index.html`: yükleme, nickname doğrulama ve ana menü
- `create-room.html`: oda kodu oluşturma
- `join-room.html`: oda kodu ile katılma
- `lobby.html`: oyuncu listesi, hazır durumu ve maç başlatma
- `game.html`: maç ekranı ve oyun motoru
- `server.js`: Express statik sunucu + Socket.io eşzamanlı maç sunucusu
- `js/shared.js`: nickname doğrulama, socket bağlantısı, session state, ses ve ortak yardımcılar
- Sayfaya özel JS dosyaları: `js/main.js`, `js/create-room.js`, `js/join-room.js`, `js/lobby.js`, `js/game-page.js`
- Maç motoru ve gerçek zamanlı senkronizasyon `js/game.js` içinde.

Oyuncu adı ve oyuncu token'ı `sessionStorage` üzerinde tutulur. Oda durumu, hazır durumu, roller, vuruş/kurtarış seçimleri, skor ve maç sonucu artık **sunucu tarafında** yönetilir; istemciler yalnızca Socket.io event'leriyle güncellenir.

## Backend mimarisi

- `server.js` statik dosyaları `express.static` ile sunar ve aynı HTTP sunucusuna Socket.io'yu bağlar.
- Port `process.env.PORT || 3000` üzerinden okunur (Railway otomatik olarak enjekte eder).
- Oda verisi sunucu belleğinde bir `Map` içinde tutulur; oda boşaldığında silinir.
- Oda kodları `nanoid` ile 6 karakter üretilir ve çakışma kontrolü yapılır.
- Bağlantı koptuğunda oyuncuya 10 saniye süreyle yeniden bağlanma toleransı tanınır; eski socket'in geç `disconnect` olayı yeni bağlantıyı geçersiz kılmaz.

### Socket.io event'leri

| Event | Yön | Açıklama |
| --- | --- | --- |
| `room:create` | client → server | 6 haneli kodlu oda açar |
| `room:join` | client → server | Kodla odaya katılır |
| `room:leave` | client → server | Odadan ayrılır |
| `lobby:ready` | client → server | Hazır durumunu günceller |
| `match:start` | client → server | Oda sahibi maçı başlatır |
| `shot:submit` | client → server | Forvetin hedef bölgesini gönderir |
| `save:submit` | client → server | Kalecinin kurtarış bölgesini gönderir |
| `match:next` | client → server | Sonraki tura geçer |
| `room:state` / `room:playerJoined` / `lobby:playerReady` | server → client | Lobide canlı oyuncu listesi |
| `match:started` | server → client | Maç başlar, roller dağıtılır |
| `round:result` | server → client | Sonuç açıklanır (`GOL` / `KURTARDI`) |
| `round:ready` | server → client | Yeni tur hazır |
| `match:finished` | server → client | Maç sona erer |

Vuruş/kurtarış senkronizasyonu sunucuda yapılır: iki taraf da seçimini göndermeden sonuç açıklanmaz. Aynı bölge seçilirse `KURTARDI`, farklı bölge seçilirse `GOL` sonucu üretilir. Aynı oyuncu ikinci kez gönderim yaparsa istek yok sayılır (idempotent).

## Prototipte bulunanlar

- Koyu temalı mobil lobby
- Gerçek zamanlı 1v1 düello (iki cihaz / iki tarayıcı)
- Oda kodu oluşturma / odaya katılma akışı
- Canlı hazır durumları ve oyuncu slotları
- Hazır durumlar tamamlanınca maçın otomatik başlaması
- Hedef alanına dokunarak manuel vuruş/kurtarış seçimi
- iki tarafın ayrı kilitlemesi ve `Oyuncu bekleniyor…` geri bildirimi
- Düdük, vuruş, tribün ve gol sesleri
- Tüm butonlarda ortak tıklama/keyboard sesi (`assets/buttontiklama.mp3`)
- Forvet ve kalecı rolleri (tur tur değişir)
- 5 + 5 vuruş ve altın penaltı
- GOL / KURTARDI sonuç animasyonları ve skor senkronizasyonu
- Gol, kurtarış ve vuruş istatistikleri
- Bağlantı koptuğunda uyarı ve maç sonlandırma
- Maçtan çıkış ve lobiden çıkış için onay penceresi
- Menü müziği sayfalar arasında kesintisiz devam eder
- Vuruş animasyonunda yalnızca top hareket eder; dokunma/aim çemberi başlangıç noktasında kalır.
- Oyun topu vektörel SVG assetiyle görünür: `assets/clker-free-vector-images-soccer-ball-310065.svg`
- Kaleci görseli `assets/goalkeeper.png` assetiyle görünür.
- Maç sahnesinde `assets/stad.jpg` stadyum görseli arka plan olarak kullanılır.
- Emoji yerine Google Material Symbols ikonları kullanılır.
- Klavye desteği: butonlarla erişilebilir vuruş ve kurtarış akışı

## Not

- Oda durumu bellekte tutulur; sunucu yeniden başladığında odalar sıfırlanır. Kalıcı veri tabanı bu aşamanın kapsamı dışındadır.
- Kimlik doğrulama veya kullanıcı hesapları bulunmamaktadır; oyuncular `sessionStorage` içindeki anonim token ile eşleştirilir.
- 3 kişilik turnuva modunun gerçek zamanlı senkronizasyonu ayrı bir aşamada ele alınacaktır.
- Gerçek para, bahis veya casino özellikleri kapsam dışıdır.

## Deployment (Railway)

`package.json` içindeki `start` komutu `node server.js` olarak çalışır. Deploy sonrası:

1. Deploy Logs'ta `Server listening on port XXXX` satırını doğrulayın.
2. Tarayıcı konsolunda ağ sekmesinden websocket filtresiyle bağlantının `101 Switching Protocols` döndüğünü doğrulayın.
