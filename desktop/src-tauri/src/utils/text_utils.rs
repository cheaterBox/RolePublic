//! Text utilities for resume-vs-JD match scoring.
//!
//! All functions are pure (no I/O, no RNG) so scoring is reproducible.
//!
//! Pipeline: `strip_latex` -> `tokenize` -> optional `stem` (inside tokenize)
//! -> set ops / TF-IDF vector ops.

use std::collections::{HashMap, HashSet};

/// English stopwords + LaTeX residue that leaks through stripping.
/// Kept short and explicit so behavior is auditable.
pub const STOPWORDS: &[&str] = &[
    // articles / conjunctions / prepositions
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "for",
    "of",
    "to",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "as",
    "into",
    "out",
    "up",
    "down",
    "over",
    "under",
    "again",
    "further",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "any",
    "both",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "can",
    "will",
    "just",
    "don",
    "should",
    "now",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "having",
    "do",
    "does",
    "did",
    "doing",
    "would",
    "could",
    "may",
    "might",
    "must",
    "shall",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
    "my",
    "your",
    "his",
    "its",
    "our",
    "their",
    "what",
    "which",
    "who",
    "whom",
    "whose",
    // common resume filler
    "work",
    "working",
    "worked",
    "experience",
    "experienced",
    "year",
    "years",
    "role",
    "team",
    "company",
    "via",
    "using",
    "used",
    "use",
    "include",
    "includes",
    "including",
    "well",
    "strong",
    "solid",
    "good",
    "great",
    "across",
    "within",
    "also",
    "able",
    "etc",
    "via",
    "plus",
    "around",
    "via",
    // LaTeX residue that survives stripping
    "begin",
    "end",
    "document",
    "item",
    "items",
    "label",
    "ref",
    "cite",
    "usepackage",
    "documentclass",
    "section",
    "subsection",
    "textbf",
    "textit",
    "emph",
    "href",
    "url",
    "usepackage",
    "input",
    "include",
    "newpage",
    "noindent",
    "centering",
];

/// Curated technical skills/keywords. Stemmed forms included for plurals.
/// Add to this list to expand coverage — no other code changes needed.
pub const SKILLS_LEXICON: &[&str] = &[
    // Languages (stemmed forms included)
    "rust",
    "python",
    "typescript",
    "javascript",
    "go",
    "java",
    "kotlin",
    "swift",
    "cpp",
    "csharp",
    "ruby",
    "php",
    "scala",
    "elixir",
    "haskell",
    "perl",
    "dart",
    "lua",
    "r",
    "matlab",
    "sql",
    "graphql",
    "html",
    "css",
    "sass",
    "less",
    // Web frameworks / libraries
    "react",
    "vue",
    "angular",
    "svelte",
    "nextjs",
    "nuxtjs",
    "remix",
    "astro",
    "webpack",
    "vite",
    "rollup",
    "parcel",
    "tailwind",
    "bootstrap",
    "materialui",
    "redux",
    "mobx",
    "rxjs",
    "vuex",
    "pinia",
    "tanstack",
    "reactquery",
    // Backend
    "axum",
    "actix",
    "rocket",
    "warp",
    "django",
    "flask",
    "fastapi",
    "starlette",
    "express",
    "nestjs",
    "koa",
    "hapi",
    "gin",
    "echo",
    "fiber",
    "spring",
    "springboot",
    "rails",
    "laravel",
    "symfony",
    "phoenix",
    "aspnet",
    // Databases
    "postgres",
    "postgresql",
    "mysql",
    "mariadb",
    "mongodb",
    "redis",
    "memcached",
    "elasticsearch",
    "dynamodb",
    "sqlite",
    "cassandra",
    "clickhouse",
    "snowflake",
    "bigquery",
    "redshift",
    "neo4j",
    "influxdb",
    "cockroachdb",
    // Cloud / DevOps
    "aws",
    "gcp",
    "azure",
    "kubernetes",
    "k8s",
    "docker",
    "terraform",
    "ansible",
    "helm",
    "jenkins",
    "github",
    "gitlab",
    "prometheus",
    "grafana",
    "loki",
    "argo",
    "istio",
    "linkerd",
    "consul",
    "vault",
    "nginx",
    "traefik",
    "serverless",
    "lambda",
    "cloudfront",
    "s3",
    "ec2",
    "rds",
    "eks",
    "ecs",
    "fargate",
    // AI / ML
    "pytorch",
    "tensorflow",
    "jax",
    "sklearn",
    "scikit",
    "pandas",
    "numpy",
    "scipy",
    "langchain",
    "llamaindex",
    "huggingface",
    "transformers",
    "embedding",
    "embeddings",
    "rag",
    "finetuning",
    "prompt",
    "agent",
    "agents",
    "nlp",
    "llm",
    "llms",
    "vectordb",
    "pinecone",
    "weaviate",
    "qdrant",
    "chroma",
    "milvus",
    // Concepts / architecture
    "microservice",
    "microservices",
    "rest",
    "grpc",
    "soap",
    "kafka",
    "rabbitmq",
    "nats",
    "eventdriven",
    "cqrs",
    "eventSourcing",
    "observability",
    "monitoring",
    "distributed",
    "highavailability",
    "loadbalancing",
    "caching",
    "tracing",
    "opentelemetry",
    "jaeger",
    "zipkin",
    // Methodologies / soft
    "agile",
    "scrum",
    "kanban",
    "tdd",
    "bdd",
    "ddd",
    "cicd",
    "devops",
    "leadership",
    "mentoring",
    "communication",
    "collaboration",
    "ownership",
    "stakeholder",
    "crossfunctional",
    "remote",
    "hybrid",
    // Misc tech
    "websocket",
    "webrtc",
    "wasm",
    "webassembly",
    "electron",
    "tauri",
    "reactnative",
    "flutter",
    "ionic",
    "xamarin",
    "unity",
    "godot",
    "opengl",
    "vulkan",
    "metal",
    "cuda",
    "opencl",
    "ros",
    "embedded",
    "linux",
    "unix",
    "bash",
    "zsh",
    "powershell",
    "vim",
    "neovim",
    "git",
    "linux",
    "nginx",
    "dns",
    "tcp",
    "udp",
    "http",
    "https",
    "tls",
    "ssl",
    "oauth",
    "jwt",
    "openid",
    "saml",
    "sso",
    "rbac",
    "iam",
    // Data / analytics
    "etl",
    "elt",
    "datawarehouse",
    "datalake",
    "lakehouse",
    "airflow",
    "dbt",
    "spark",
    "hadoop",
    "flink",
    "beam",
    "kafka",
    "storm",
    "hive",
    "presto",
    "trino",
];

/// Build a lookup set from the skills lexicon (stemmed).
fn skills_set() -> &'static HashSet<&'static str> {
    use std::sync::OnceLock;
    static SET: OnceLock<HashSet<&'static str>> = OnceLock::new();
    SET.get_or_init(|| SKILLS_LEXICON.iter().copied().collect())
}

/// Strip LaTeX commands, environments, comments, and special characters.
/// Keeps the readable text content; lowercases output.
pub fn strip_latex(input: &str) -> String {
    // 1. Remove % comments to end-of-line
    let mut s = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            while let Some(&nc) = chars.peek() {
                chars.next();
                if nc == '\n' {
                    break;
                }
            }
        } else {
            s.push(c);
        }
    }

    // 2. Drop preamble: \documentclass{...} ... \begin{document}
    if let Some(doc_start) = s.find("\\begin{document}") {
        s = s[doc_start + "\\begin{document}".len()..].to_string();
    }
    // Remove \documentclass[...]{...} and \documentclass{...}
    s = remove_command_with_braces(&s, "documentclass");

    // 3. Strip \begin{env}...\end{env} but keep inner text (recursively, since
    //    nested envs like itemize inside enumerate are common).
    s = strip_environments(&s);

    // 4. Strip remaining \command{...} and \command[...] patterns.
    //    Repeat until no more changes (handles consecutive commands).
    loop {
        let prev_len = s.len();
        s = remove_braced_commands(&s);
        s = remove_bracketed_commands(&s);
        if s.len() == prev_len {
            break;
        }
    }

    // 5. Strip remaining bare \command sequences (no args).
    s = remove_bare_commands(&s);

    // 6. Replace LaTeX special chars and math delimiters.
    let mut out = String::with_capacity(s.len());
    let mut in_math = false;
    for c in s.chars() {
        match c {
            '$' => {
                in_math = !in_math;
                out.push(' ');
            }
            '\\' | '{' | '}' | '~' | '^' => out.push(' '),
            '&' => out.push(' '), // alignment in tables/eqn
            '_' => out.push(' '), // subscript marker
            _ if in_math => out.push(' '),
            c => out.push(c),
        }
    }

    // 7. Normalize whitespace and lowercase.
    out.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Remove `\name{...}` (and `\name{...}{...}` chains) by string replace.
fn remove_braced_commands(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            // skip command name
            let name_start = i + 1;
            let mut name_end = name_start;
            while name_end < bytes.len()
                && (bytes[name_end].is_ascii_alphabetic() || bytes[name_end] == b'*')
            {
                name_end += 1;
            }
            if name_end > name_start {
                // skip whitespace
                let mut j = name_end;
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < bytes.len() && bytes[j] == b'{' {
                    // matched \name{ -> find matching }
                    let depth_start = j;
                    let mut depth = 0;
                    let mut k = j;
                    while k < bytes.len() {
                        if bytes[k] == b'{' {
                            depth += 1;
                        } else if bytes[k] == b'}' {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        k += 1;
                    }
                    if k < bytes.len() {
                        // keep inner content, drop the braces
                        out.push_str(&s[depth_start + 1..k]);
                        i = k + 1;
                        continue;
                    }
                }
                // not a braced command; emit the bare command as-is and advance
                out.push_str(&s[i..name_end]);
                i = name_end;
                continue;
            }
        }
        // push char (preserve UTF-8 safely by working on char boundaries)
        let ch_end = next_char_boundary(s, i);
        out.push_str(&s[i..ch_end]);
        i = ch_end;
    }
    out
}

fn remove_bracketed_commands(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let name_start = i + 1;
            let mut name_end = name_start;
            while name_end < bytes.len()
                && (bytes[name_end].is_ascii_alphabetic() || bytes[name_end] == b'*')
            {
                name_end += 1;
            }
            if name_end > name_start {
                let mut j = name_end;
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < bytes.len() && bytes[j] == b'[' {
                    let mut depth = 0;
                    let mut k = j;
                    while k < bytes.len() {
                        if bytes[k] == b'[' {
                            depth += 1;
                        } else if bytes[k] == b']' {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        k += 1;
                    }
                    if k < bytes.len() {
                        out.push_str(&s[i..j]); // drop [..]
                        i = k + 1;
                        continue;
                    }
                }
                out.push_str(&s[i..name_end]);
                i = name_end;
                continue;
            }
        }
        let ch_end = next_char_boundary(s, i);
        out.push_str(&s[i..ch_end]);
        i = ch_end;
    }
    out
}

fn remove_command_with_braces(s: &str, name: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let pat = format!("\\{}", name);
    let pat_bytes = pat.as_bytes();
    while i < bytes.len() {
        if i + pat_bytes.len() <= bytes.len() && &bytes[i..i + pat_bytes.len()] == pat_bytes {
            let mut j = i + pat_bytes.len();
            // skip [opts]
            if j < bytes.len() && bytes[j] == b'[' {
                let mut depth = 0;
                while j < bytes.len() {
                    if bytes[j] == b'[' {
                        depth += 1;
                    } else if bytes[j] == b']' {
                        depth -= 1;
                        if depth == 0 {
                            j += 1;
                            break;
                        }
                    }
                    j += 1;
                }
            }
            // skip whitespace
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            // skip braces
            if j < bytes.len() && bytes[j] == b'{' {
                let mut depth = 0;
                while j < bytes.len() {
                    if bytes[j] == b'{' {
                        depth += 1;
                    } else if bytes[j] == b'}' {
                        depth -= 1;
                        if depth == 0 {
                            j += 1;
                            break;
                        }
                    }
                    j += 1;
                }
            }
            i = j;
            continue;
        }
        let ch_end = next_char_boundary(s, i);
        out.push_str(&s[i..ch_end]);
        i = ch_end;
    }
    out
}

fn remove_bare_commands(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let name_start = i + 1;
            let mut name_end = name_start;
            while name_end < bytes.len()
                && (bytes[name_end].is_ascii_alphabetic() || bytes[name_end] == b'*')
            {
                name_end += 1;
            }
            if name_end > name_start {
                // drop the command entirely (including trailing optional [..])
                let mut j = name_end;
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < bytes.len() && bytes[j] == b'[' {
                    let mut depth = 0;
                    while j < bytes.len() {
                        if bytes[j] == b'[' {
                            depth += 1;
                        } else if bytes[j] == b']' {
                            depth -= 1;
                            if depth == 0 {
                                j += 1;
                                break;
                            }
                        }
                        j += 1;
                    }
                }
                i = j;
                continue;
            }
        }
        let ch_end = next_char_boundary(s, i);
        out.push_str(&s[i..ch_end]);
        i = ch_end;
    }
    out
}

fn strip_environments(s: &str) -> String {
    let mut out = s.to_string();
    loop {
        let prev = out.clone();
        // Look for any \begin{env} ... \end{env} (env = ascii letters)
        if let Some(start) = find_begin(&out) {
            let env_start = start + "\\begin{".len();
            let env_end = match out[env_start..].find('}') {
                Some(i) => env_start + i,
                None => return out,
            };
            let env_name = &out[env_start..env_end];
            let end_marker = format!("\\end{{{}}}", env_name);
            let body_start = env_end + 1;
            if let Some(end_idx) = out[body_start..].find(&end_marker) {
                let body = &out[body_start..body_start + end_idx];
                // recurse on body then re-emit
                let stripped_body = strip_environments(body);
                let mut replaced = String::with_capacity(out.len());
                replaced.push_str(&out[..start]);
                replaced.push_str(&stripped_body);
                replaced.push_str(&out[body_start + end_idx + end_marker.len()..]);
                out = replaced;
            } else {
                // unmatched \begin — drop it
                out = format!("{}{}", &out[..start], &out[env_end + 1..]);
            }
        } else {
            break;
        }
        if out == prev {
            break;
        }
    }
    out
}

fn find_begin(s: &str) -> Option<usize> {
    s.find("\\begin{")
}

fn next_char_boundary(s: &str, i: usize) -> usize {
    let mut j = i + 1;
    while j < s.len() && !s.is_char_boundary(j) {
        j += 1;
    }
    j
}

fn is_vowel(c: char) -> bool {
    matches!(c, 'a' | 'e' | 'i' | 'o' | 'u' | 'y')
}

/// Porter-stem-lite. Strips common suffixes only. Over-stemming is OK for matching.
///
/// Rules: longest suffix first, minimum stem length applied per rule so we
/// don't over-stem short words like 'aws', 'postgres', 'kubernetes'.
pub fn stem(word: &str) -> String {
    let w = word;
    if w.len() < 4 {
        return w.to_string();
    }

    // (suffix, replacement, min_stem_len_after_strip)
    // Rules ordered longest-first per suffix group so the longest match wins.
    const RULES: &[(&str, &str, usize)] = &[
        // --- derivational (long) ---
        ("ational", "ate", 3),
        ("tional", "tion", 3),
        ("ization", "ize", 3),
        ("iveness", "ive", 3),
        ("fulness", "ful", 3),
        ("ousness", "ous", 3),
        ("ability", "able", 3),
        ("ibility", "ible", 3),
        // --- noun-forming ---
        ("ment", "", 4),
        ("ness", "", 4),
        ("tion", "", 4),
        ("sion", "", 4),
        ("ation", "", 5),
        ("ity", "", 5),
        // --- plurals with -es (clear endings) ---
        ("sses", "ss", 3),
        ("shes", "sh", 3),
        ("ches", "ch", 3),
        ("xes", "x", 3),
        ("zes", "z", 3),
        // --- plural -ies ---
        ("ies", "y", 3), // cities -> city, qualities -> quality
        // --- verb / participle ---
        ("ying", "y", 3),
        ("ings", "", 5), // meetings -> meeting
        ("ing", "", 4),  // running -> runn (we accept crude stems)
        ("ied", "y", 3),
        ("ed", "", 4),
        // --- adverb / comparative ---
        ("ly", "", 4),
        ("est", "", 4),
        ("er", "", 4),
        // --- adjective ---
        ("able", "", 4),
        ("ible", "", 4),
        ("ous", "", 4),
        ("ive", "", 4),
        ("ful", "", 4),
        ("less", "", 4),
        // --- derivational (short) ---
        ("ate", "", 4),
        ("ize", "", 4),
        ("ise", "", 4),
        ("al", "", 4),
        ("ic", "", 4),
    ];

    // --- plain plural -s (handled separately: only if preceded by non-vowel AND stem >= 3 chars
    //     AND not ending in 'ss', 'us', 'is' which are not real plurals) ---
    if w.len() >= 4
        && w.ends_with('s')
        && !w.ends_with("ss")
        && !w.ends_with("us")
        && !w.ends_with("is")
    {
        let chars: Vec<char> = w.chars().collect();
        let n = chars.len();
        if n >= 2 && !is_vowel(chars[n - 2]) {
            let mut stem_str = &w[..n - 1];
            // drop the 'e' before the 's' if present (buses -> bus, classes -> class)
            if stem_str.ends_with('e') && stem_str.len() >= 5 {
                stem_str = &stem_str[..stem_str.len() - 1];
            }
            if stem_str.len() >= 3 {
                return stem_str.to_string();
            }
        }
    }

    for (suffix, repl, min) in RULES {
        if let Some(stem_str) = w.strip_suffix(suffix) {
            if stem_str.len() >= *min {
                let mut s = String::with_capacity(stem_str.len() + repl.len());
                s.push_str(stem_str);
                s.push_str(repl);
                return s;
            }
        }
    }
    w.to_string()
}

/// Tokenize: lowercase, split on non-alphanumeric, drop stopwords, drop short tokens,
/// and stem each remaining token.
pub fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::with_capacity(text.len() / 6);
    let mut current = String::new();
    for c in text.chars() {
        if c.is_alphanumeric() || c == '-' {
            current.push(c.to_ascii_lowercase());
        } else {
            if !current.is_empty() {
                push_token(&mut out, &current);
                current.clear();
            }
        }
    }
    if !current.is_empty() {
        push_token(&mut out, &current);
    }
    out
}

fn push_token(out: &mut Vec<String>, raw: &str) {
    if raw.len() < 2 {
        return;
    }
    if STOPWORDS.contains(&raw) {
        return;
    }
    out.push(stem(raw));
}

/// Extract skills found in the text. Returns stemmed canonical forms present.
pub fn extract_skills(text: &str) -> HashSet<String> {
    let tokens = tokenize(text);
    let lexicon = skills_set();
    let mut out = HashSet::new();
    for t in &tokens {
        if lexicon.contains(t.as_str()) {
            out.insert(t.clone());
        }
    }
    out
}

/// Jaccard similarity between two sets.
pub fn jaccard<T: Eq + std::hash::Hash>(a: &HashSet<T>, b: &HashSet<T>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(b).count() as f64;
    let union = a.union(b).count() as f64;
    if union == 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// TF-IDF cosine similarity over a corpus of tokenized documents.
pub struct TfIdf {
    /// IDF for each term: log((N+1) / (df+1)) + 1 (smoothed)
    idf: HashMap<String, f64>,
    /// Vocabulary size (for zero-padding vectors to consistent length)
    vocab: Vec<String>,
}

impl TfIdf {
    /// Build IDF weights from a corpus.
    pub fn build(docs: &[Vec<String>]) -> Self {
        let n = docs.len() as f64;
        let mut df: HashMap<String, usize> = HashMap::new();
        for doc in docs {
            let unique: HashSet<&String> = doc.iter().collect();
            for t in unique {
                *df.entry(t.clone()).or_insert(0) += 1;
            }
        }
        let mut idf = HashMap::with_capacity(df.len());
        let mut vocab = Vec::with_capacity(df.len());
        for (term, count) in df {
            let w = (((n + 1.0) / (count as f64 + 1.0)).ln() + 1.0).max(0.0);
            idf.insert(term.clone(), w);
            vocab.push(term);
        }
        vocab.sort();
        TfIdf { idf, vocab }
    }

    /// Convert tokens to a TF*IDF vector aligned with `self.vocab`.
    pub fn vector(&self, tokens: &[String]) -> Vec<f64> {
        let mut tf: HashMap<&str, f64> = HashMap::new();
        for t in tokens {
            *tf.entry(t.as_str()).or_insert(0.0) += 1.0;
        }
        let len = tokens.len() as f64;
        let mut v = vec![0.0; self.vocab.len()];
        for (i, term) in self.vocab.iter().enumerate() {
            if let Some(&c) = tf.get(term.as_str()) {
                let tf_norm = if len > 0.0 { c / len } else { 0.0 };
                let idf_w = self.idf.get(term).copied().unwrap_or(0.0);
                v[i] = tf_norm * idf_w;
            }
        }
        v
    }

    /// Cosine similarity between two pre-computed vectors.
    pub fn cosine(a: &[f64], b: &[f64]) -> f64 {
        if a.len() != b.len() {
            return 0.0;
        }
        let mut dot = 0.0;
        let mut na = 0.0;
        let mut nb = 0.0;
        for (x, y) in a.iter().zip(b.iter()) {
            dot += x * y;
            na += x * x;
            nb += y * y;
        }
        if na == 0.0 || nb == 0.0 {
            return 0.0;
        }
        dot / (na.sqrt() * nb.sqrt())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_removes_documentclass() {
        let s = "\\documentclass{article}\n\\begin{document}\nHello world\\end{document}";
        let out = strip_latex(s);
        assert!(!out.contains("documentclass"));
        assert!(out.contains("hello"));
        assert!(out.contains("world"));
    }

    #[test]
    fn strip_removes_comments() {
        let s = "Hello % this is a comment\nWorld";
        let out = strip_latex(s);
        assert_eq!(out, "hello world");
    }

    #[test]
    fn strip_strips_commands_with_args() {
        let s = "\\textbf{Bold} and \\section{Intro} here";
        let out = strip_latex(s);
        assert!(out.contains("bold"));
        assert!(out.contains("intro"));
        assert!(out.contains("here"));
    }

    #[test]
    fn strip_strips_environments() {
        let s = "\\begin{itemize}\\item one \\item two\\end{itemize}";
        let out = strip_latex(s);
        assert!(out.contains("one"));
        assert!(out.contains("two"));
        assert!(!out.contains("itemize"));
    }

    #[test]
    fn strip_lowercases() {
        let out = strip_latex("Hello WORLD");
        assert_eq!(out, "hello world");
    }

    #[test]
    fn stem_collapses_plurals() {
        assert_eq!(stem("teams"), "team");
        assert_eq!(stem("classes"), "class");
    }

    #[test]
    fn stem_collapses_ing() {
        assert_eq!(stem("managing"), "manag");
        assert_eq!(stem("running"), "runn");
    }

    #[test]
    fn stem_collapses_ed() {
        assert_eq!(stem("managed"), "manag");
    }

    #[test]
    fn stem_collapses_ies_to_y() {
        // 'qualities' -> 'qualit' + 'y' = 'quality'
        assert_eq!(stem("qualities"), "quality");
        assert_eq!(stem("cities"), "city");
    }

    #[test]
    fn tokenize_drops_stopwords() {
        let toks = tokenize("the quick brown fox is on the table");
        assert!(toks.contains(&"quick".to_string()) || toks.contains(&"brown".to_string()));
        assert!(!toks.contains(&"the".to_string()));
        assert!(!toks.contains(&"is".to_string()));
    }

    #[test]
    fn extract_skills_finds_known() {
        let skills = extract_skills("Built REST APIs with Rust and Postgres on AWS");
        assert!(skills.contains("rust"));
        assert!(skills.contains("postgres"));
        assert!(skills.contains("aws"));
        assert!(skills.contains("rest"));
    }

    #[test]
    fn extract_skills_ignores_unknown() {
        let skills = extract_skills("The quick brown fox jumps over the lazy dog");
        assert_eq!(skills.len(), 0);
    }

    #[test]
    fn jaccard_returns_one_for_identical() {
        let a: HashSet<_> = ["a", "b", "c"].iter().map(|s| s.to_string()).collect();
        let b = a.clone();
        assert_eq!(jaccard(&a, &b), 1.0);
    }

    #[test]
    fn jaccard_returns_zero_for_disjoint() {
        let a: HashSet<_> = ["a", "b"].iter().map(|s| s.to_string()).collect();
        let b: HashSet<_> = ["x", "y"].iter().map(|s| s.to_string()).collect();
        assert_eq!(jaccard(&a, &b), 0.0);
    }

    #[test]
    fn jaccard_returns_zero_for_two_empty() {
        let a: HashSet<String> = HashSet::new();
        let b = HashSet::new();
        assert_eq!(jaccard(&a, &b), 0.0);
    }

    #[test]
    fn jaccard_partial_set() {
        let a: HashSet<_> = ["a", "b", "c"].iter().map(|s| s.to_string()).collect();
        let b: HashSet<_> = ["b", "c", "d"].iter().map(|s| s.to_string()).collect();
        // |inter|=2, |union|=4
        assert!((jaccard(&a, &b) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn tfidf_cosine_identical_is_one() {
        let docs = vec![
            vec!["rust".to_string(), "postgres".to_string()],
            vec!["rust".to_string(), "postgres".to_string()],
        ];
        let m = TfIdf::build(&docs);
        let v1 = m.vector(&docs[0]);
        let v2 = m.vector(&docs[1]);
        assert!((TfIdf::cosine(&v1, &v2) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn tfidf_cosine_orthogonal_is_zero() {
        let docs = vec![
            vec!["rust".to_string(), "postgres".to_string()],
            vec!["piano".to_string(), "violin".to_string()],
        ];
        let m = TfIdf::build(&docs);
        let v1 = m.vector(&docs[0]);
        let v2 = m.vector(&docs[1]);
        assert_eq!(TfIdf::cosine(&v1, &v2), 0.0);
    }

    #[test]
    fn tfidf_handles_empty_doc() {
        let docs = vec![vec!["a".to_string()], vec![]];
        let m = TfIdf::build(&docs);
        let v1 = m.vector(&docs[0]);
        let v2 = m.vector(&docs[1]);
        assert_eq!(TfIdf::cosine(&v1, &v2), 0.0);
    }
}
