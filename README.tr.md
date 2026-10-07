# brickids

[English](README.md) · [Türkçe](README.tr.md)

**brickids**, basit ve doğrudan etkileşime odaklanan, tarayıcı üzerinde çalışan 3B bir blok/LEGO benzeri yapım oyun alanıdır. Proje özellikle masaüstü, tablet ve mobil cihazlarda **erken yaşta oyun ve serbest yapım deneyimini daha kolay hale getirmek** amacıyla sadeleştirilmiştir.

Canlı sürüm: https://alorak.github.io/brickids/

> **Köken / upstream:** Bu depo **Berkopan/lego-bricks** projesinin fork ve uyarlamasıdır. Upstream kodu [Berkopan/lego-bricks upstream](https://github.com/alorak/brickids/commit/3a6a0186eb71165b40ae2a1f2a8d4693e8a24b6b "chore: import Berkopan/lego-bricks upstream") commit'i ile projeye alınmıştır. Sonraki geliştirmelerde arayüz; daha kolay serbest yapım, dokunmatik kullanım, daha az kontrol ve erken yaş oyun deneyimi yönünde değiştirilmiştir.

Proje **TypeScript**, **Three.js** ve **Rapier** kullanır. Tamamen tarayıcı içerisinde çalışır ve GitHub Pages üzerinde statik dosyalar olarak yayınlanabilir. Backend, kullanıcı hesabı veya API anahtarı gerektirmez.

## Bu forkta neler değişti?

Güncel sürüm, upstream başlangıç noktasına göre bilinçli olarak daha çok bir oyuncak ve daha az bir teknik araç gibi davranır.

- **Erken yaş için sade etkileşim.** Parçayı seçme, sürükleme, döndürme, ayırma ve silme işlemleri karmaşık paneller açmadan yapılabilir.
- **Masaüstü, tablet ve mobil düzenleri.** Dokunmatik cihazlarda ayrıca kamera/build modu seçmek gerekmez.
- **Kompakt mobil Library.** Sekiz renk yuvası en solda **2 sütun × 4 satır** olarak sabit kalır; parçalar sağ tarafta iki satırlı yatay kaydırılabilir şerit halinde gösterilir.
- **Minimal parça araçları.** Dokunmatik görünümde seçili parça için yalnızca **Ayır**, **Döndür** ve **Sil** bulunur. Masaüstünde de aynı hızlı eylem yaklaşımı kullanılır.
- **Çift dokunma / çift tıklama ile ayırma.** Bağlı bir parça, gelişmiş menü açmadan altındaki parçadan ayrılabilir.
- **Klavye ile döndürme.** Y ekseninde dönüş için **R** veya **.** kullanılabilir; numpad nokta tuşu da desteklenir.
- **İsteğe bağlı fizik.** Fizik motoru uygulama açıldığında **kapalıdır**. Kullanıcı isterse fizik butonundan açabilir.
- **Logo ile kaydetme.** **brickids** logosuna tıklamak, Kaydet butonuyla aynı localStorage kaydetme işlemini yapar.
- **Daha anlaşılır parça sınırları.** Birbirine bağlı parçaların gerçek temas bölgelerinde hafif seam/ayrım çizgileri gösterilir.
- **Daha geniş ve net çalışma alanı.** Sis/beyaz haze kaldırıldı; zoom-out aralığı ve görünür baseplate **240 × 240 stud** olacak şekilde büyütüldü.
- **Tablet/mobil boşluk düzeltmeleri.** Kaldırılmış eski kontroller için ayrılan gereksiz alan temizlendi.
- **Daha sakin bildirimler.** Bağlantı başarı bildirimi kaldırıldı; bağlantı sesi korunuyor.

## Yapım özellikleri

### Parçalar

Şu anda **16 sadeleştirilmiş parça tipi** bulunuyor:

| Aile | Parçalar |
| --- | --- |
| Brick | 1×2, 1×4, 2×2, 2×4 |
| Plate | 1×2, 1×4, 2×2, 2×4 |
| Tile | 1×2, 2×2 |
| Yuvarlak | 1×1 brick, 1×1 plate |
| Eğimli | 2×2 slope, 1×1 cheese slope |
| Özel | 2×2 corner plate, 1×4 arch |

Geometri gerçek üretim CAD'i olmak için değil, interaktif yapım oyunu için tasarlanmıştır.

### Renkler

Hızlı erişim paletinde yedi temel renk bulunur:

- Kırmızı
- Mavi
- Sarı
- Yeşil
- Turuncu
- Koyu Turkuaz
- Siyah

Sekizinci yuva **Other / Diğer** rengidir. Bu düğme, **214 BrickLink renginden** oluşan aranabilir renk listesini açar. Seçilen Diğer rengi tarayıcıda hatırlanır.

### Yerleştirme ve bağlantılar

- Parçalar Library kartına tıklanarak veya Library'den çalışma alanına sürüklenerek eklenebilir.
- Sürüklenen parça havada bırakılmaz; altında bulunan ilk fiziksel yüzeye oturtulur.
- Zemindeki parçalar görünür baseplate stud ızgarasına hizalanır.
- Uyumlu stud/socket konumuna yakın bırakılan parçaya bağlantı hizalama yardımı uygulanır.
- Bağlı parçalar tek bir grup gibi hareket eder.
- Geniş parçalar birden fazla desteğe aynı anda bağlanabilir.
- Ayrım çizgileri genel kutu kenarı yerine gerçek temas bölgelerine göre oluşturulur.

## Kontroller

### Masaüstü

| İşlem | Kontrol |
| --- | --- |
| Parça ekle | Library kartına tıkla veya çalışma alanına sürükle |
| Seç | Parçaya tıkla |
| Taşı | Seçili parçayı sürükle |
| Y ekseninde döndür | Döndür butonu, **R** veya **.** |
| Eğ | **X / Z** |
| Yükselt / alçalt | **E / Q** |
| Dik konuma getir | **U** |
| Ayır | Ayır butonu veya bağlı parçaya/seam'e çift tıkla |
| Sil | Sil butonu, **Delete** veya **Backspace** |
| Bağla | Uyumlu bağlantıya yakın bırak; hizalıyken **Space** de press işlemini çalıştırır |
| Kamerayı döndür | Boş alanı sürükle |
| Pan | Sağ tuşla sürükle |
| Zoom | Fare tekerleği |

### Dokunmatik / mobil

- Seçmek için **parçaya dokun**.
- Taşımak için **parçayı sürükle**.
- Kamerayı döndürmek için **boş alanı sürükle**.
- Pan ve pinch-zoom için **iki parmak kullan**.
- Bağlı parçayı alttaki parçadan ayırmak için **çift dokun**.
- Küçük seçim kutusunda yalnızca **Ayır**, **Döndür** ve **Sil** bulunur.
- Mobil Library'de renkler solda sabittir; parçalar sağ tarafta yatay kaydırılır.
- Parçaya dokunarak ekleyebilir veya Library'den çalışma alanına doğru sürükleyebilirsin.

Eski saydam joystick, yukarı/aşağı tuşları, Connect düğmesi, kamera/build anahtarı ve zoom düğmeleri güncel mobil arayüzde bilinçli olarak kullanılmıyor.

## Fizik

Rapier; rigid-body fiziği, çarpışma, sürtünme ve bağlı parça grupları için kullanılır.

Fizik uygulama açıldığında **varsayılan olarak kapalıdır**. Böylece özellikle serbest ve erken yaş yapımında sahne daha sakin ve öngörülebilir kalır. İstenirse üstteki fizik butonundan açılabilir.

Fizik açıkken:

- serbest parçalar düşebilir ve çarpışabilir,
- bağlı parçalar grup halinde davranır,
- çarpışma sesleri çalabilir,
- yan düşmüş serbest parçalar durduktan sonra baseplate üzerinde dik konuma toparlanabilir.

Gerçek ABS plastik esnemesi ve clutch-force modellenmez; bağlantılar fixed joint olarak temsil edilir.

## Kaydetme ve kalıcılık

brickids iki farklı kalıcılık yöntemi sunar.

### Tarayıcıya yerel kaydetme

Sahne aşağıdaki localStorage anahtarında saklanır:

`brickids-scene`

Kaydetmek için:

- sahne menüsündeki **Kaydet** butonuna basabilir veya
- **brickids logosuna** tıklayabilirsin.

Kaydedilen sahne aynı tarayıcı/profil ile sonraki açılışta otomatik olarak geri yüklenir.

### Dosya içe / dışa aktarma

Sahne menüsünde JSON import/export desteği bulunur; böylece brickids sahneleri başka tarayıcıya taşınabilir veya harici yedek olarak saklanabilir. Ayrıca **LDraw `.ldr` içe ve dışa aktarma** desteği vardır.

LDraw import bilinçli olarak temkinlidir: brickids'in mevcut 16 yerel parça eşlemesi konum, dönüş ve renk bilgileriyle içe alınır; desteklenmeyen `.dat` referansları tüm dosyayı bozmak yerine atlanır ve kullanıcıya raporlanır. Direct RGB renkleri ve yaygın standart LDraw renklerinin bir bölümü desteklenir.

`.mpd` dosyaları ve gömülü `0 FILE` submodel'leri desteklenir. Submodel referansları recursive olarak flatten edilir, parent/child transformları birleştirilir ve LDraw renk `16` kalıtımı iç içe seviyelerde çözülür. Döngüsel submodel referansları ve aşırı derin iç içe yapılar reddedilir. Flatten edilmiş modelde brickids bağlantı/joint grafiği henüz yeniden kurulmadığı için modelin dağılmaması amacıyla import sonrasında fizik kapatılır.

LDraw export tarafında brickids konumları, dönüşleri, desteklenen parça tipleri ve renkleri type-1 parça referanslarına çevrilir; hızlı palet standart LDraw renk kodlarını, diğer renkler ise direct RGB değerlerini kullanır.

Dil seçimi ve Diğer renk seçimi de yerel olarak hatırlanır.

## Baseplate ve kamera

Varsayılan dünya beyaz LEGO benzeri bir baseplate kullanır.

- Görünür stud alanı: **240 × 240**
- Alt zemin: **600 × 600 world unit**
- Genişletilmiş zoom-out aralığı
- Sahne sisi yok; uzaktaki parçalar beyazlaşarak kaybolmaz

Stud'lar binlerce ayrı mesh yerine instancing ile verimli biçimde çizilir.

## Yerelde çalıştırma

**Node.js 22 veya üzeri** gerekir.

```sh
npm ci
npm run dev
```

Vite'ın gösterdiği localhost adresini aç.

Diğer komutlar:

```sh
npm test
npm run build
npm run preview
```

Güncel WebGL2 ve WebAssembly destekli bir tarayıcı önerilir.

## Proje yapısı

| Modül | Sorumluluk |
| --- | --- |
| `src/main.ts` | Sahne, masaüstü girdileri, seçim arayüzü, kaydet/yükle |
| `src/mobile.ts` | Dokunmatik gesture ve touch-layout davranışı |
| `src/mobile.css` | Tablet/mobil Library ve seçim düzeni |
| `src/engine/catalog.ts` | Parça tanımları, hızlı renkler ve connector bilgileri |
| `src/bricklink-colors.ts` | 214 renkli BrickLink katalog snapshot'ı |
| `src/engine/geometry.ts` | Prosedürel parça geometrisi |
| `src/engine/solids.ts` | Özel parçaların ortak solid tanımları |
| `src/engine/connections.ts` | Bağlantı kuralları ve bağlı bileşen dolaşımı |
| `src/engine/seams.ts` | Temas/ayrım çizgisi geometrisi |
| `src/engine/world.ts` | Rapier body'leri, snap, joint, ayırma ve persistence |
| `src/engine/audio.ts` | Yerel seslerin oynatılması |
| `src/scene/ground.ts` | Baseplate stud alanı ve zemin çizimi |
| `src/i18n.ts` | İngilizce/Türkçe arayüz metinleri |

## Tasarım kapsamı

brickids bir interaktif yapım oyuncağıdır; hassas LEGO CAD yazılımı veya mühendislik simülasyonu değildir.

- Boyutlar ve collision şekilleri sadeleştirilmiştir.
- Gerçek clutch force, elastik deformasyon, malzeme gerilmesi ve yük altında bağlantı kopması modellenmez.
- 250 parça oluşturma/import sınırı bulunur.
- Performans cihazın gücüne ve bağlı yapıların karmaşıklığına bağlıdır.
- Dokunmatik arayüzde motorun bütün ileri seviye işlemlerini göstermek yerine sade kullanım tercih edilir.

Amaç, ileri seviye kontroller eklemeden önce yapım sürecini anlaşılır ve oyun odaklı tutmaktır.

## Ses kaynakları

Gerçek kayıtlar **CC0 1.0** altında projeye dahil edilmiştir:

- [Lego Click (short) — ImmergoMedia](https://freesound.org/people/ImmergoMedia/sounds/670000/) — çarpışma seslerinde kullanılır.
- [Connecting two LEGO Bricks — LauraWebdev](https://freesound.org/people/LauraWebdev/sounds/257245/) — bağlantı ve ayırma seslerinde kullanılan kesitlerin kaynağıdır.

Ek ses kaynağı bilgileri `public/audio/CREDITS.txt` ve [docs/audio-analysis.md](docs/audio-analysis.md) dosyalarında bulunur.

[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

## Marka notu

Bu proje bağımsız, fan yapımı bir deneydir; LEGO Group ile bağlantılı değildir ve LEGO Group tarafından onaylanmamıştır. LEGO, LEGO Group'un ticari markasıdır. Projede resmi LEGO logoları veya resmi ürün fotoğrafları kullanılmaz.
