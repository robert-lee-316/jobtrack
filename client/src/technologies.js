const RULES = [
 ['TypeScript', /\btypescript\b/i],
 ['TypeScript', /\bTS\b/],
 ['JavaScript', /\bjavascript\b/i],
 ['JavaScript', /\bJS\b/],
 ['Python', /\bpython\b/i],
 ['Java', /\bjava\b/i],
 ['C#', /\bc\s*#|\bc\s*sharp\b|\bcsharp\b/i],
 ['C++', /\bc\s*\+\+/i],
 ['Go', /(?<![A-Za-z0-9_])Go(?:lang)?(?!\s+(?:to|ahead|through|for|into|out|back|live|beyond|home|wrong|away|over|around)\b)(?![\w-])/i],
 ['Rust', /\brust\b/i],
 ['Ruby on Rails', /\bruby\s+on\s+rails\b/i],
 ['Ruby', /\bruby\b(?!\s+on\s+rails)/i],
 ['Rails', /\brails\b/i],
 ['PHP', /\bphp\b/i],
 ['Kotlin', /\bkotlin\b/i],
 ['Swift', /\bSwift(?:UI)?\b/],
 ['Swift', /\bswiftui\b/i],
 ['Scala', /\bscala\b/i],
 ['Objective-C', /\bobjective-?c\b/i],
 ['HTML', /\bhtml5?\b/i],
 ['CSS', /\bcss3?\b/i],
 ['Sass', /\bsass\b|\bscss\b/i],
 ['Bash', /\bbash\b/i],
 ['PowerShell', /\bpowershell\b/i],
 ['Dart', /\bdart\b/i],
 ['Elixir', /\belixir\b/i],
 ['Clojure', /\bclojure\b/i],
 ['Haskell', /\bhaskell\b/i],
 ['Perl', /\bperl\b/i],
 ['R', /\brstudio\b|\btidyverse\b|\bshiny\b|\br\s+programming\b/i],
 ['React Native', /\breact\s+native\b/i],
 ['React', /\breact(?:\.js|js)?\b(?!\s+native)/i],
 ['Next.js', /\bnext\.?js\b/i],
 ['Vue.js', /\bvue(?:\.js|js)?\b/i],
 ['Angular', /\bangular(?:js)?\b/i],
 ['Svelte', /\bsvelte(?:kit)?\b/i],
 ['Nuxt', /\bnuxt(?:\.js|js)?\b/i],
 ['Redux', /\bredux\b/i],
 ['Tailwind CSS', /\btailwind(?:\s*css)?\b/i],
 ['Bootstrap', /\bbootstrap\b/i],
 ['jQuery', /\bjquery\b/i],
 ['Webpack', /\bwebpack\b/i],
 ['Vite', /\bvite\b/i],
 ['Node.js', /\bnode\.?js\b|\bnodejs\b/i],
 ['Node.js', /\bNode\b/],
 ['Express', /\bExpress(?:\.js)?\b|\bexpress\.js\b/],
 ['NestJS', /\bnest\.?js\b/i],
 ['Django', /\bdjango\b/i],
 ['Flask', /\bflask\b/i],
 ['FastAPI', /\bfastapi\b/i],
 ['Spring Boot', /\bspring\s+boot\b/i],
 ['Spring', /\bspring\b(?!\s+boot)/i],
 ['Hibernate', /\bhibernate\b/i],
 ['Laravel', /\blaravel\b/i],
 ['ASP.NET', /\basp\.net\b/i],
 ['.NET', /\.net\b|\bdotnet\b/i],
 ['PostgreSQL', /\bpostgres(?:ql)?\b/i],
 ['MySQL', /\bmysql\b/i],
 ['MongoDB', /\bmongodb\b|\bmongo\b/i],
 ['Redis', /\bredis\b/i],
 ['Elasticsearch', /\belasticsearch\b|\belastic\s*search\b/i],
 ['SQL Server', /\bsql\s*server\b|\bmssql\b/i],
 ['Oracle', /\boracle\b/i],
 ['SQLite', /\bsqlite\b/i],
 ['DynamoDB', /\bdynamodb\b/i],
 ['Cassandra', /\bcassandra\b/i],
 ['Snowflake', /\bsnowflake\b/i],
 ['BigQuery', /\bbigquery\b/i],
 ['SQL', /\bSQL\b/],
 ['Kafka', /\bkafka\b/i],
 ['RabbitMQ', /\brabbitmq\b/i],
 ['GraphQL', /\bgraphql\b/i],
 ['gRPC', /\bgrpc\b/i],
 ['REST', /\bRESTful\b|\bREST(?:\s+APIs?)?\b/],
 ['Docker', /\bdocker\b/i],
 ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
 ['Terraform', /\bterraform\b/i],
 ['Ansible', /\bansible\b/i],
 ['Jenkins', /\bjenkins\b/i],
 ['GitHub Actions', /\bgithub\s+actions\b/i],
 ['GitLab', /\bgitlab\b/i],
 ['Git', /\bgit\b/i],
 ['AWS', /\baws\b|\bamazon web services\b|\bamazon (?=s3|ec2|lambda)\b/i],
 ['S3', /\bS3\b|\bamazon s3\b/i],
 ['Azure', /\bazure\b/i],
 ['GCP', /\bgcp\b|\bgoogle cloud\b/i],
 ['Linux', /\blinux\b/i],
 ['Nginx', /\bnginx\b/i],
 ['CI/CD', /\bci\/cd\b/i],
 ['TensorFlow', /\btensorflow\b/i],
 ['PyTorch', /\bpytorch\b/i],
 ['Pandas', /\bpandas\b/i],
 ['NumPy', /\bnumpy\b/i],
 ['scikit-learn', /\bscikit-learn\b|\bsklearn\b/i],
 ['Spark', /\bapache spark\b|\bspark\b/i],
 ['Hadoop', /\bhadoop\b/i],
 ['Airflow', /\bairflow\b/i],
 ['Tableau', /\btableau\b/i],
 ['Power BI', /\bpower\s*bi\b/i],
 ['Jest', /\bjest\b/i],
 ['Cypress', /\bcypress\b/i],
 ['Playwright', /\bplaywright\b/i],
 ['Selenium', /\bselenium\b/i],
 ['Prisma', /\bprisma\b/i],
 ['Firebase', /\bfirebase\b/i]
];

const SUPPRESS = [['Ruby on Rails', 'Rails']];

export function extractTechnologies(text = '') {
 const source = String(text || '');
 if (!source.trim()) return [];
 const hits = [];
 for (const [name, pattern] of RULES) {
  const match = pattern.exec(source);
  if (match) hits.push({name, index: match.index});
 }
 hits.sort((a, b) => a.index - b.index || a.name.localeCompare(b.name));
 const seen = new Set();
 const names = [];
 for (const hit of hits) {
  const key = hit.name.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  names.push(hit.name);
 }
 return names.filter(name => !SUPPRESS.some(([specific, general]) => name === general && names.includes(specific)));
}
