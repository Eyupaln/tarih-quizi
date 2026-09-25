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
- `game.html`: mevcut maç ekranı ve oyun motoru
- `js/shared.js`: nickname doğrulama, session state, loading ve ortak yardımcılar
- Sayfaya özel JS dosyaları: `js/main.js`, `js/create-room.js`, `js/join-room.js`, `js/lobby.js`, `js/game-page.js`
- Mevcut maç motoru `js/game.js` içinde korunuyor.

Oyuncu adı, oda kodu ve oda durumu `sessionStorage` üzerinden sayfalar arasında aktarılır. Backend/socket bağlantısı eklenene kadar akış mevcut bot/demo oyuncu mantığıyla çalışır.

## Prototipte bulunanlar

- Koyu temalı mobil lobby
- 1v1 düello ve 3 kişilik turnuva modu
- Oda kodu oluşturma / odaya katılma akışı
- Hazır durumları ve oyuncu slotları
- Hedef alanına dokunarak manuel vuruş/kurtarış seçimi
- Vuruşu Gönder ve Rakip Kurtar butonlarıyla iki tarafın ayrı kilitlemesi
- `Oyuncu bekleniyor…` geri bildirimi
- 3 · 2 · 1 · VUR! geri sayım animasyonu
- Forvet ve kalecı rolleri
- 5 + 5 vuruş ve altın penaltı
- GOL / KURTARDI / KAÇIRDI sonuç animasyonları
- Gol, kurtarış ve vuruş istatistikleri
- Turnuva maç kartları ve canlı sıralama
- `PAZARA ÇIKIYOR!` arkadaşlık cezası kartı
- Vuruş animasyonunda yalnızca top hareket eder; dokunma/aim çemberi başlangıç noktasında kalır.
- Oyun topu vektörel SVG assetiyle görünür: `assets/clker-free-vector-images-soccer-ball-310065.svg`
- Kaleci görseli `assets/goalkeeper.png` assetiyle görünür.
- Maç sahnesinde `assets/stad.jpg` stadyum görseli arka plan olarak kullanılır.
- Emoji yerine Google Material Symbols ikonları kullanılır.
- Klavye desteği: butonlarla erişilebilir vuruş ve kurtarış akışı

## Not

Bu sürüm, iki cihaz arasında gerçek ağ bağlantısı kurmadan tek cihazda akışı denemek için bot rakip kullanır. Gerçek multiplayer sürümü için sonraki adım; oda kodu, hazır durumu, eşzamanlı vuruş gönderimi ve sonuç doğrulamasını yöneten bir WebSocket/API sunucusudur. WebSocket sunucusu eklenmeden kimlik doğrulama, sıralama veya gerçek oyuncu eşleştirmesi yapılmamalıdır.
