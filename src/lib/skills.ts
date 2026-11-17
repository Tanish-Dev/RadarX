/**
 * Skills taxonomy: canonical name → aliases. Used for both job descriptions and
 * the resume, so matching is symmetric.
 *
 * Alias syntax:
 *   "pytorch"   case-insensitive, word-bounded (boundaries also respect + # . so "c++" ≠ "c")
 *   "=Go"       case-SENSITIVE — for words that are also plain English ("Go", "React", "Swift", "R")
 */
export const SKILLS: Record<string, string[]> = {
  // ── Languages ──
  Python: ["python", "python3"],
  Java: ["java"],
  "C++": ["c++", "cpp"],
  C: ["=C", "c programming", "embedded c"],
  "C#": ["c#", "csharp"],
  Go: ["golang", "=Go"],
  Rust: ["rust"],
  JavaScript: ["javascript", "=JS", "ecmascript", "es6"],
  TypeScript: ["typescript"],
  Kotlin: ["kotlin"],
  Swift: ["=Swift", "swiftui"],
  Scala: ["scala"],
  Ruby: ["ruby"],
  PHP: ["php"],
  R: ["=R", "r programming", "rstudio"],
  MATLAB: ["matlab"],
  Julia: ["=Julia"],
  Haskell: ["haskell"],
  OCaml: ["ocaml"],
  Perl: ["perl"],
  Lua: ["lua"],
  Dart: ["dart"],
  Solidity: ["solidity"],
  Bash: ["bash", "shell scripting", "shell script"],
  SQL: ["sql"],
  Verilog: ["verilog"],
  SystemVerilog: ["systemverilog"],
  VHDL: ["vhdl"],
  Assembly: ["assembly language", "x86 assembly", "arm assembly"],

  // ── Web ──
  HTML: ["html", "html5"],
  CSS: ["css", "css3", "sass", "scss"],
  React: ["=React", "react.js", "reactjs"],
  "Next.js": ["next.js", "nextjs"],
  "Node.js": ["node.js", "nodejs", "=Node"],
  Express: ["express.js", "expressjs"],
  "Vue.js": ["vue", "vue.js", "vuejs", "nuxt"],
  Angular: ["angular", "angularjs"],
  Svelte: ["svelte", "sveltekit"],
  "Tailwind CSS": ["tailwind", "tailwindcss"],
  Redux: ["redux"],
  GraphQL: ["graphql"],
  "REST APIs": ["rest api", "rest apis", "restful", "=REST"],
  gRPC: ["grpc"],
  Django: ["django"],
  Flask: ["flask"],
  FastAPI: ["fastapi"],
  "Spring Boot": ["spring boot", "spring framework", "springboot"],
  "Ruby on Rails": ["rails", "ruby on rails"],
  Laravel: ["laravel"],
  ".NET": [".net", "asp.net", "dotnet"],
  WebSockets: ["websocket", "websockets"],
  WebAssembly: ["webassembly", "wasm"],
  "Three.js": ["three.js", "threejs", "webgl"],

  // ── Mobile ──
  Android: ["android"],
  iOS: ["=iOS", "ios development"],
  Flutter: ["flutter"],
  "React Native": ["react native"],

  // ── Data stores ──
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb", "mongo"],
  Redis: ["redis"],
  Elasticsearch: ["elasticsearch", "opensearch"],
  Cassandra: ["cassandra"],
  DynamoDB: ["dynamodb"],
  SQLite: ["sqlite"],
  Firebase: ["firebase", "firestore"],
  Supabase: ["supabase"],
  "Vector databases": ["vector database", "vector databases", "vector db", "pinecone", "weaviate", "qdrant", "milvus", "pgvector", "chromadb"],

  // ── Data engineering & analytics ──
  "Apache Spark": ["apache spark", "pyspark", "=Spark"],
  Hadoop: ["hadoop", "hdfs", "hive"],
  Kafka: ["kafka"],
  Airflow: ["airflow"],
  dbt: ["=dbt"],
  Snowflake: ["=Snowflake"],
  BigQuery: ["bigquery"],
  Databricks: ["databricks"],
  ETL: ["etl", "elt", "data pipeline", "data pipelines"],
  "Data warehousing": ["data warehouse", "data warehousing", "data lake", "lakehouse"],
  Pandas: ["pandas"],
  NumPy: ["numpy"],
  SciPy: ["scipy"],
  Matplotlib: ["matplotlib", "seaborn", "plotly"],
  Tableau: ["tableau"],
  "Power BI": ["power bi", "powerbi"],
  Excel: ["=Excel", "ms excel", "microsoft excel"],
  Statistics: ["statistics", "statistical", "hypothesis testing", "regression analysis"],
  "A/B testing": ["a/b testing", "a/b test", "ab testing", "experimentation"],
  "Data analysis": ["data analysis", "data analytics", "exploratory data analysis", "=EDA"],
  "Data visualization": ["data visualization", "data visualisation", "dashboards", "dashboarding"],
  "Time series": ["time series", "time-series", "forecasting"],

  // ── AI / ML ──
  "Machine learning": ["machine learning", "=ML"],
  "Deep learning": ["deep learning", "neural network", "neural networks"],
  PyTorch: ["pytorch", "torch"],
  TensorFlow: ["tensorflow", "tf2"],
  Keras: ["keras"],
  JAX: ["=JAX"],
  "scikit-learn": ["scikit-learn", "sklearn", "scikit learn"],
  XGBoost: ["xgboost", "lightgbm", "catboost", "gradient boosting"],
  "Hugging Face": ["hugging face", "huggingface", "=Transformers"],
  LLMs: ["llm", "llms", "large language model", "large language models", "gpt", "foundation models"],
  "Generative AI": ["generative ai", "genai", "gen ai"],
  "AI agents": ["ai agents", "ai agent", "agentic", "multi-agent", "autonomous agents", "tool use", "function calling"],
  RAG: ["=RAG", "retrieval-augmented", "retrieval augmented"],
  LangChain: ["langchain", "langgraph"],
  LlamaIndex: ["llamaindex", "llama index"],
  "Prompt engineering": ["prompt engineering", "prompting"],
  "Fine-tuning": ["fine-tuning", "fine tuning", "finetuning", "lora", "peft", "rlhf"],
  NLP: ["nlp", "natural language processing", "natural language understanding", "text classification", "named entity recognition"],
  "Computer vision": ["computer vision", "image processing", "object detection", "image segmentation"],
  OpenCV: ["opencv"],
  YOLO: ["=YOLO", "yolov5", "yolov8"],
  "Diffusion models": ["diffusion model", "diffusion models", "stable diffusion"],
  "Reinforcement learning": ["reinforcement learning", "=RL"],
  "Recommender systems": ["recommender system", "recommender systems", "recommendation system", "recommendation systems", "recsys"],
  "Speech / audio ML": ["speech recognition", "text-to-speech", "=ASR", "=TTS", "audio processing"],
  MLOps: ["mlops", "model deployment", "model serving", "mlflow", "kubeflow"],
  CUDA: ["cuda", "gpu programming"],
  "Model optimization": ["quantization", "distillation", "model compression", "tensorrt", "onnx"],
  "Distributed training": ["distributed training", "deepspeed", "fsdp", "megatron"],
  "Graph ML": ["graph neural network", "graph neural networks", "=GNN", "=GNNs"],
  "Information retrieval": ["information retrieval", "search ranking", "semantic search", "embeddings"],

  // ── Cloud / DevOps / infra ──
  AWS: ["=AWS", "amazon web services", "ec2", "lambda functions", "aws lambda", "=S3"],
  GCP: ["=GCP", "google cloud", "google cloud platform"],
  Azure: ["azure", "microsoft azure"],
  Docker: ["docker", "containers", "containerization"],
  Kubernetes: ["kubernetes", "k8s", "helm"],
  Terraform: ["terraform", "infrastructure as code", "=IaC"],
  Ansible: ["ansible"],
  "CI/CD": ["ci/cd", "continuous integration", "continuous delivery", "jenkins", "github actions", "gitlab ci", "circleci"],
  Linux: ["linux", "unix"],
  Git: ["=git", "=Git", "github", "gitlab", "version control"],
  Observability: ["prometheus", "grafana", "datadog", "opentelemetry", "observability", "monitoring"],
  Microservices: ["microservices", "microservice", "service-oriented"],
  "Distributed systems": ["distributed systems", "distributed system", "distributed computing"],
  "System design": ["system design", "scalable systems", "high availability", "scalability"],
  Networking: ["tcp/ip", "computer networks", "networking protocols", "=TCP", "=DNS", "=HTTP"],
  Serverless: ["serverless"],

  // ── CS fundamentals ──
  "Data structures & algorithms": ["data structures", "algorithms", "=DSA", "data structures and algorithms"],
  "Object-oriented programming": ["object-oriented", "object oriented", "=OOP", "=OOPS"],
  "Operating systems": ["operating systems", "operating system", "kernel", "linux kernel"],
  DBMS: ["=DBMS", "database management", "database design", "relational databases"],
  Compilers: ["compiler", "compilers", "llvm"],
  "Concurrency": ["concurrency", "multithreading", "multi-threading", "parallel programming"],
  "Low latency": ["low latency", "low-latency", "high performance computing", "=HPC"],

  // ── Security ──
  Cybersecurity: ["cybersecurity", "cyber security", "information security", "infosec"],
  "Penetration testing": ["penetration testing", "pentesting", "pen testing", "ethical hacking", "red team"],
  Cryptography: ["cryptography", "encryption"],
  "Network security": ["network security", "firewalls", "=SIEM", "intrusion detection"],
  "Application security": ["application security", "appsec", "=OWASP", "secure coding"],

  // ── Hardware / embedded / robotics ──
  "Embedded systems": ["embedded systems", "embedded system", "embedded software", "firmware"],
  Microcontrollers: ["microcontroller", "microcontrollers", "=MCU", "stm32", "esp32", "avr", "=PIC"],
  Arduino: ["arduino"],
  "Raspberry Pi": ["raspberry pi"],
  RTOS: ["rtos", "freertos", "real-time operating system", "zephyr"],
  IoT: ["iot", "internet of things"],
  FPGA: ["fpga", "fpgas", "xilinx", "vivado"],
  "ASIC / VLSI": ["=ASIC", "vlsi", "rtl design", "=RTL", "physical design", "synthesis"],
  "Design verification": ["design verification", "=UVM", "functional verification"],
  "PCB design": ["pcb", "pcb design", "altium", "kicad", "schematic design"],
  "Circuit design": ["circuit design", "analog design", "mixed-signal", "analog circuits", "digital circuits", "digital design"],
  "Computer architecture": ["computer architecture", "cpu architecture", "gpu architecture", "risc-v", "riscv", "=ARM"],
  ROS: ["=ROS", "ros2", "robot operating system"],
  Robotics: ["robotics", "robot", "robots", "motion planning", "slam"],
  "Control systems": ["control systems", "control theory", "=PID", "simulink"],
  "Signal processing": ["signal processing", "=DSP", "digital signal processing"],
  Sensors: ["sensor fusion", "lidar", "sensors"],
  "Autonomous vehicles": ["autonomous vehicles", "autonomous driving", "self-driving", "=ADAS"],

  // ── Design / product ──
  Figma: ["figma"],
  "UI/UX design": ["ui/ux", "=UX", "=UI", "user experience", "user interface", "interaction design", "product design"],
  "User research": ["user research", "usability testing", "user interviews"],
  Prototyping: ["prototyping", "wireframing", "wireframes", "mockups"],
  "Design systems": ["design system", "design systems"],
  "Adobe Creative Suite": ["adobe xd", "photoshop", "illustrator", "after effects"],
  Accessibility: ["accessibility", "wcag", "=a11y"],

  // ── Quant / finance ──
  Probability: ["probability", "stochastic", "stochastic calculus"],
  "Quantitative finance": ["quantitative finance", "derivatives pricing", "options pricing", "market making", "trading strategies", "quantitative research"],
  "Linear algebra": ["linear algebra"],
  Optimization: ["convex optimization", "numerical optimization", "operations research", "linear programming"],

  // ── Other tech ──
  Blockchain: ["blockchain", "web3", "ethereum", "smart contracts"],
  "Game development": ["game development", "=Unity", "unreal engine", "game engine"],
  "AR/VR": ["augmented reality", "virtual reality", "=AR/VR", "=XR", "mixed reality"],
  Testing: ["unit testing", "test automation", "selenium", "cypress", "playwright", "pytest", "jest", "=QA"],
  Agile: ["agile", "scrum"],
  "Technical writing": ["technical writing", "documentation"],
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

interface Matcher {
  skill: string;
  /** case-insensitive aliases, tested against lowercased text */
  ci: RegExp | null;
  /** case-sensitive aliases, tested against the original text */
  cs: RegExp | null;
}

// boundaries treat + and # as word chars ("c++" ≠ "c"), and a dot only ends a word if no letter follows
const L = "(?<![A-Za-z0-9+#])";
const R = "(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])";

const MATCHERS: Matcher[] = Object.entries(SKILLS).map(([skill, aliases]) => {
  const ci = aliases.filter((a) => !a.startsWith("=")).map((a) => esc(a.toLowerCase()));
  const cs = aliases.filter((a) => a.startsWith("=")).map((a) => esc(a.slice(1)));
  return {
    skill,
    ci: ci.length ? new RegExp(`${L}(?:${ci.join("|")})${R}`) : null,
    cs: cs.length ? new RegExp(`${L}(?:${cs.join("|")})${R}`) : null,
  };
});

/** Extract canonical skill names from free text (job title+description or a resume). */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return MATCHERS.filter((m) => m.ci?.test(lower) || m.cs?.test(text)).map((m) => m.skill);
}

export const ALL_SKILLS = Object.keys(SKILLS);

/** Case-insensitive lookup of a canonical skill name (for user-edited chips). */
export function canonicalSkill(s: string): string | null {
  const t = s.trim().toLowerCase();
  for (const [skill, aliases] of Object.entries(SKILLS)) {
    if (skill.toLowerCase() === t || aliases.some((a) => a.replace(/^=/, "").toLowerCase() === t)) return skill;
  }
  return null;
}
