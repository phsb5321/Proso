/**
 * franc-min Language Detection Accuracy Test
 * T097b: Verify ≥80% accuracy (16/20 correct detections)
 *
 * Test corpus: 20 text samples (10 languages, 2 samples each ~200 words)
 * Languages: en, es, fr, de, it, pt, ru, zh, ja, ar
 */

import { franc } from 'franc-min';
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';

// ISO 639-3 to ISO 639-1 mapping (matches utils/language/detector.ts)
const ISO6393_TO_ISO6391 = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  cmn: 'zh',
  jpn: 'ja',
  arb: 'ar',
};

/**
 * Test corpus with ~200 word samples per language
 * Each language has 2 samples for more reliable accuracy measurement
 */
const TEST_CORPUS = [
  // English samples
  {
    language: 'en',
    text: 'The quick brown fox jumps over the lazy dog. This pangram contains every letter of the English alphabet. Language detection algorithms analyze text patterns and character frequencies to determine the most likely language. Machine learning models have significantly improved accuracy in recent years. Natural language processing enables computers to understand human communication. The technology has applications in translation, sentiment analysis, and content moderation. Modern systems can handle multiple languages with high precision. Text classification is a fundamental task in computational linguistics. Statistical methods compare input text against language-specific patterns. The confidence score indicates how certain the algorithm is about its prediction.',
  },
  {
    language: 'en',
    text: 'Software development requires careful planning and execution. Developers write code to solve complex problems and create useful applications. Testing ensures that programs work correctly under various conditions. Documentation helps other programmers understand how the code works. Version control systems track changes and enable collaboration. Agile methodologies promote iterative development and continuous improvement. Code reviews catch bugs and improve code quality. Debugging is the process of finding and fixing errors in software. Performance optimization makes programs run faster and use less memory. Security considerations protect users and their data from malicious attacks.',
  },

  // Spanish samples
  {
    language: 'es',
    text: 'El español es uno de los idiomas más hablados del mundo. Millones de personas lo utilizan como lengua materna en España y América Latina. La gramática española tiene reglas claras pero también muchas excepciones. Los verbos se conjugan de manera diferente según el tiempo y la persona. El vocabulario incluye palabras de origen latino, árabe y otras lenguas. La literatura española ha producido obras maestras reconocidas internacionalmente. Don Quijote de la Mancha es considerada la primera novela moderna. La cultura hispana es rica y diversa, con tradiciones únicas en cada región. El flamenco y la salsa son expresiones musicales populares del mundo hispanohablante.',
  },
  {
    language: 'es',
    text: 'La tecnología ha transformado nuestra forma de vivir y trabajar. Los teléfonos inteligentes nos mantienen conectados en todo momento. Las redes sociales permiten compartir información instantáneamente. El comercio electrónico facilita comprar productos desde cualquier lugar. La inteligencia artificial está revolucionando múltiples industrias. Los vehículos autónomos prometen cambiar el transporte urbano. La computación en la nube ofrece recursos escalables y flexibles. La ciberseguridad protege nuestros datos personales y financieros. Las energías renovables combaten el cambio climático. La educación en línea democratiza el acceso al conocimiento global.',
  },

  // French samples
  {
    language: 'fr',
    text: `La France est connue pour sa culture, sa cuisine et son histoire riche. Paris, la capitale, attire des millions de touristes chaque année. La Tour Eiffel est devenue le symbole emblématique du pays. Les Français sont fiers de leur patrimoine gastronomique et viticole. Le fromage et le vin font partie intégrante de la tradition culinaire. La langue française est parlée sur tous les continents. Elle est une des langues officielles de nombreuses organisations internationales. La littérature française a influencé le monde entier pendant des siècles. Les impressionnistes ont révolutionné l'art de la peinture au dix-neuvième siècle.`,
  },
  {
    language: 'fr',
    text: `L'éducation joue un rôle fondamental dans le développement personnel. Les écoles enseignent les compétences essentielles pour réussir dans la vie. L'apprentissage des langues étrangères ouvre de nouvelles perspectives. Les sciences et les mathématiques développent la pensée logique. L'histoire nous aide à comprendre le présent et anticiper l'avenir. La philosophie encourage la réflexion critique et le questionnement. Les arts cultivent la créativité et l'expression personnelle. Le sport favorise la santé physique et mentale. La formation continue permet de s'adapter aux changements professionnels. L'université prépare les étudiants aux défis du monde moderne.`,
  },

  // German samples
  {
    language: 'de',
    text: 'Deutschland ist bekannt für seine Ingenieurskunst und Präzision. Die Automobilindustrie gehört zu den wichtigsten Wirtschaftszweigen des Landes. Berlin ist eine lebendige Hauptstadt mit einer bewegten Geschichte. Die deutsche Sprache hat komplexe grammatische Strukturen. Substantive werden großgeschrieben und haben grammatisches Geschlecht. Das Oktoberfest in München zieht Besucher aus der ganzen Welt an. Die deutsche Küche bietet mehr als nur Würstchen und Sauerkraut. Philosophen und Dichter haben die Geistesgeschichte geprägt. Das Bildungssystem legt großen Wert auf technische Ausbildung. Erneuerbare Energien spielen eine zunehmend wichtige Rolle.',
  },
  {
    language: 'de',
    text: 'Die Digitalisierung verändert alle Bereiche unseres Lebens grundlegend. Unternehmen müssen sich an neue Technologien anpassen. Homeoffice ist für viele Arbeitnehmer zur Normalität geworden. Künstliche Intelligenz unterstützt bei komplexen Entscheidungsprozessen. Datenschutz gewinnt zunehmend an Bedeutung in der digitalen Welt. Online-Shopping hat den Einzelhandel revolutioniert. Streaming-Dienste ersetzen traditionelle Fernsehsender. Soziale Netzwerke beeinflussen die öffentliche Meinungsbildung. Cyberkriminalität stellt eine wachsende Bedrohung dar. Die digitale Transformation erfordert kontinuierliche Weiterbildung aller Mitarbeiter.',
  },

  // Italian samples
  {
    language: 'it',
    text: `L'Italia è famosa per la sua arte, la moda e la cucina raffinata. Roma, la città eterna, conserva tesori archeologici inestimabili. Il Colosseo testimonia la grandezza dell'Impero Romano. La lingua italiana deriva dal latino e ha una melodia unica. La musica lirica ha raggiunto la perfezione nei teatri italiani. Leonardo da Vinci e Michelangelo hanno creato capolavori immortali. La pasta e la pizza sono apprezzate in tutto il mondo. Il design italiano rappresenta l'eccellenza nella moda e nell'arredamento. Il calcio è una vera passione nazionale che unisce milioni di tifosi.`,
  },
  {
    language: 'it',
    text: `La tecnologia sta trasformando il modo in cui viviamo quotidianamente. I dispositivi mobili sono diventati strumenti indispensabili per tutti. Le applicazioni semplificano attività che prima richiedevano molto tempo. L'intelligenza artificiale promette di rivoluzionare molteplici settori industriali. La robotica automatizza processi produttivi sempre più complessi. Le automobili elettriche rappresentano il futuro della mobilità sostenibile. La telemedicina permette consultazioni mediche a distanza. L'educazione digitale offre opportunità di apprendimento flessibili. La sicurezza informatica protegge i nostri dati personali. L'innovazione tecnologica crea nuove professioni e competenze richieste.`,
  },

  // Portuguese samples
  {
    language: 'pt',
    text: 'O Brasil é o maior país da América do Sul e tem uma cultura vibrante. A língua portuguesa é falada por milhões de pessoas em todo o mundo. O carnaval do Rio de Janeiro é uma festa mundialmente famosa. A floresta amazônica abriga a maior biodiversidade do planeta. O futebol é uma paixão nacional que une todos os brasileiros. A música brasileira inclui estilos como samba, bossa nova e forró. A culinária brasileira é rica e variada, com influências africanas e indígenas. As praias brasileiras atraem turistas de todos os continentes. A economia brasileira é uma das maiores do mundo. A diversidade cultural do país reflete sua história de imigração.',
  },
  {
    language: 'pt',
    text: 'A tecnologia digital transformou completamente a sociedade moderna. Os computadores são ferramentas essenciais em praticamente todas as profissões. A internet conecta pessoas e informações instantaneamente pelo mundo inteiro. As redes sociais mudaram a forma como nos comunicamos uns com os outros. O comércio eletrônico revolucionou a maneira de fazer compras. A inteligência artificial está presente em diversos aspectos do cotidiano. Os aplicativos de celular facilitam inúmeras tarefas diárias. A educação a distância democratizou o acesso ao conhecimento. A segurança cibernética protege dados pessoais e empresariais. A inovação tecnológica continua criando novas oportunidades de trabalho.',
  },

  // Russian samples
  {
    language: 'ru',
    text: 'Россия является крупнейшей страной мира по территории. Москва и Санкт-Петербург привлекают миллионы туристов ежегодно. Русская литература дала миру великих писателей и поэтов. Толстой и Достоевский оказали огромное влияние на мировую культуру. Русский язык использует кириллический алфавит и имеет сложную грамматику. Балет и классическая музыка достигли совершенства в России. Матрёшки и самовары стали символами русской культуры. Зимы в России суровые, но очень красивые. Русская кухня включает борщ, пельмени и блины.',
  },
  {
    language: 'ru',
    text: 'Современные технологии изменили нашу повседневную жизнь навсегда. Смартфоны стали необходимостью для людей всех возрастов. Интернет предоставляет мгновенный доступ к любой информации. Социальные сети изменили способ общения между людьми. Онлайн-образование открывает новые возможности для обучения. Искусственный интеллект применяется во многих отраслях промышленности. Электронная коммерция упрощает процесс покупки товаров. Цифровая безопасность защищает личные данные пользователей. Удалённая работа стала нормой для многих профессий.',
  },

  // Chinese samples (Simplified)
  {
    language: 'zh',
    text: '中国是世界上人口最多的国家之一。北京是中国的首都和政治中心。长城是世界上最伟大的建筑奇迹之一。中国历史悠久，文化底蕴深厚。汉字是世界上最古老的书写系统之一。中国菜肴种类繁多，各地风味独特。茶文化在中国有数千年的历史。中国经济在过去几十年快速发展。科技创新推动了社会的进步。教育在中国社会中占有重要地位。',
  },
  {
    language: 'zh',
    text: '现代科技改变了人们的生活方式。智能手机已经成为日常生活的必需品。互联网连接了世界各地的人们。电子商务让购物变得更加便捷。人工智能正在各行各业得到广泛应用。在线教育打破了时间和空间的限制。社交媒体改变了人们交流的方式。数字支付已经取代了现金交易。远程办公成为越来越多人的选择。网络安全对于保护个人信息至关重要。',
  },

  // Japanese samples
  {
    language: 'ja',
    text: '日本は東アジアに位置する島国です。東京は世界で最も大きな都市の一つです。日本語は漢字、ひらがな、カタカナの三種類の文字を使います。寿司と天ぷらは世界中で人気のある日本料理です。日本の技術力は世界でもトップクラスです。アニメと漫画は日本文化を代表するポップカルチャーです。桜の季節には多くの人が花見を楽しみます。日本には古い伝統と最新技術が共存しています。温泉は日本人にとって大切なリラックスの場所です。',
  },
  {
    language: 'ja',
    text: 'テクノロジーは私たちの生活を大きく変えました。スマートフォンは今や必需品となっています。インターネットで世界中の情報にアクセスできます。オンラインショッピングで簡単に買い物ができます。人工知能は様々な分野で活用されています。リモートワークは新しい働き方として定着しました。ソーシャルメディアでコミュニケーションが変わりました。デジタル決済が現金に取って代わりつつあります。サイバーセキュリティの重要性が高まっています。教育もオンラインで受けられるようになりました。',
  },

  // Arabic samples
  {
    language: 'ar',
    text: 'اللغة العربية هي واحدة من أقدم اللغات في العالم. يتحدث بها ملايين الأشخاص في الشرق الأوسط وشمال أفريقيا. القرآن الكريم مكتوب باللغة العربية الفصحى. الخط العربي يعتبر فنًا جميلًا ومميزًا. الأدب العربي غني بالشعر والنثر. الثقافة العربية تتميز بالكرم والضيافة. القهوة العربية جزء مهم من التقاليد الاجتماعية. العمارة الإسلامية تتميز بالزخارف الهندسية الرائعة. التاريخ العربي حافل بالإنجازات العلمية والفكرية.',
  },
  {
    language: 'ar',
    text: 'التكنولوجيا الحديثة غيرت حياتنا بشكل جذري. الهواتف الذكية أصبحت جزءًا لا يتجزأ من يومنا. الإنترنت يوفر الوصول الفوري إلى المعلومات. التسوق الإلكتروني يجعل الشراء أكثر سهولة. الذكاء الاصطناعي يستخدم في مختلف المجالات. العمل عن بعد أصبح أمرًا شائعًا. وسائل التواصل الاجتماعي غيرت طريقة تواصلنا. الدفع الرقمي يحل محل النقد التقليدي. الأمن السيبراني ضروري لحماية البيانات الشخصية.',
  },
];

describe('franc-min Language Detection Accuracy', () => {
  let correctDetections = 0;
  const results = [];

  beforeAll(() => {
    // Run detection on all samples
    TEST_CORPUS.forEach((sample, index) => {
      const detected = franc(sample.text, { minLength: 20 });
      const detectedISO6391 = ISO6393_TO_ISO6391[detected] || detected.slice(0, 2);
      const isCorrect = detectedISO6391 === sample.language;

      if (isCorrect) {
        correctDetections++;
      }

      results.push({
        index,
        expected: sample.language,
        detected: detectedISO6391,
        raw: detected,
        correct: isCorrect,
      });
    });
  });

  it('should achieve ≥80% accuracy (16/20 correct detections)', () => {
    const accuracy = (correctDetections / TEST_CORPUS.length) * 100;
    console.log(
      `\nfranc-min Accuracy: ${correctDetections}/${TEST_CORPUS.length} (${accuracy.toFixed(1)}%)`,
    );

    // Log individual results
    console.log('\nDetailed Results:');
    results.forEach((r) => {
      const status = r.correct ? '✓' : '✗';
      console.log(
        `  ${status} Sample ${r.index + 1}: expected=${r.expected}, detected=${r.detected} (raw=${r.raw})`,
      );
    });

    // Log failures for CLAUDE.md documentation
    const failures = results.filter((r) => !r.correct);
    if (failures.length > 0) {
      console.log('\nSystematic failures for CLAUDE.md:');
      failures.forEach((f) => {
        console.log(
          `  - ${f.expected.toUpperCase()}: Detected as ${f.detected} (sample ${f.index + 1})`,
        );
      });
    }

    expect(correctDetections).toBeGreaterThanOrEqual(16);
  });

  it('should correctly detect English text', () => {
    const englishResults = results.filter((r) => r.expected === 'en');
    const englishCorrect = englishResults.filter((r) => r.correct).length;
    expect(englishCorrect).toBe(2);
  });

  it('should correctly detect Spanish text', () => {
    const spanishResults = results.filter((r) => r.expected === 'es');
    const spanishCorrect = spanishResults.filter((r) => r.correct).length;
    expect(spanishCorrect).toBe(2);
  });

  it('should correctly detect French text', () => {
    const frenchResults = results.filter((r) => r.expected === 'fr');
    const frenchCorrect = frenchResults.filter((r) => r.correct).length;
    expect(frenchCorrect).toBe(2);
  });

  it('should correctly detect German text', () => {
    const germanResults = results.filter((r) => r.expected === 'de');
    const germanCorrect = germanResults.filter((r) => r.correct).length;
    expect(germanCorrect).toBe(2);
  });

  it('should correctly detect Chinese text', () => {
    const chineseResults = results.filter((r) => r.expected === 'zh');
    const chineseCorrect = chineseResults.filter((r) => r.correct).length;
    expect(chineseCorrect).toBe(2);
  });

  it('should correctly detect Japanese text', () => {
    const japaneseResults = results.filter((r) => r.expected === 'ja');
    const japaneseCorrect = japaneseResults.filter((r) => r.correct).length;
    expect(japaneseCorrect).toBe(2);
  });

  it('should correctly detect Russian text', () => {
    const russianResults = results.filter((r) => r.expected === 'ru');
    const russianCorrect = russianResults.filter((r) => r.correct).length;
    expect(russianCorrect).toBe(2);
  });

  it('should correctly detect Arabic text', () => {
    const arabicResults = results.filter((r) => r.expected === 'ar');
    const arabicCorrect = arabicResults.filter((r) => r.correct).length;
    expect(arabicCorrect).toBe(2);
  });
});

describe('franc-min Initialization Performance', () => {
  it('detects correctly and stays deterministic under load (T097)', () => {
    const shortText = 'This is a test of the language detection system.';

    // Observable outcome: the first call (including module warm-up) detects
    // the right language. This is the assertion the old test actually relied
    // on; it is load-independent.
    const result1 = franc(shortText, { minLength: 10 });
    expect(result1).toBe('eng');

    // The old test also asserted a 50 ms first-call wall-clock budget, which
    // measured 6/27/43/79 ms on identical trees depending only on CPU load
    // (docs/reading-journey-status.md slice 24). That budget was a proxy for
    // "the extension bundles the trimmed franc-min variant, not the heavier
    // full franc package". The same property is asserted here with a
    // load-independent oracle: the bundled data module is bounded in size.
    // franc-min 6.2.0 ships ~104 KB of trigram data; the full franc package
    // ships ~1 MB+. The 1 MB bound is far above franc-min's real size (so
    // cold installs, filesystem layout and platform never flake it) and far
    // below the full franc data (so a variant regression still goes red). A
    // dependency swap to `franc` fails `require.resolve('franc-min/...')`
    // outright.
    const nodeRequire = createRequire(import.meta.url);
    const dataPath = nodeRequire.resolve('franc-min/data.js');
    const dataBytes = statSync(dataPath).size;
    expect(dataBytes).toBeGreaterThan(0);
    expect(dataBytes).toBeLessThan(1_000_000);

    // Detection is deterministic: the same input returns the same result on
    // every call, warm or cold.
    for (let i = 0; i < 5; i++) {
      expect(franc(shortText, { minLength: 10 })).toBe('eng');
    }
  });
});
