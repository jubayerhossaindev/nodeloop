# Moon CLI ব্যবহার গাইড (বাংলা)

(nodeloop) প্রজেক্টের জন্য Moon CLI ব্যবহার করার এই গাইডটি।

## Moon কী?

Moon একটি দ্রুত, ক্যাশ-ভিত্তিক বিল্ড সিস্টেম এবং টাস্ক রানার যা মোনোরেপোর জন্য তৈরি। এটি টাস্ক রান করে, ডিপেন্ডেন্সি ট্র্যাক করে এবং ক্যাশের মাধ্যমে ডেভেলপমেন্ট ও সিআই ওয়ার্কফ্লো সহজ করে।

`.moon/` ফোল্ডারে কনফিগারেশন রয়েছে:

- `workspace.yml` — ওয়ার্কস্পেস কনফিগ (প্রজেক্ট গ্লোব, ভিসিসি, টুলচেইন)
- `toolchains.yml` — টুলচেইন সংজ্ঞা (Node.js >=24, npm, Rust stable)
- `cache/` — Moon ক্যাশ ডিরেক্টরি

## Moon ইনস্টল করুন

```bash
# curl দ্বারা (macOS/Linux)
curl -LSfs https://moonrepo.dev/install/moon.sh | sh -

# অথবা npm দ্বারা
npm install -g @moonrepo/cli
```

ভার্সন চেক:

```bash
moon --version
```

এই রেপোর `workspace.yml`-এ `versionConstraint: '>=2.0.0'` আছে, তাই Moon ২.০ বা বেশি ব্যবহার করুন।

## ওয়ার্কস্পেস কনফিগ

`.moon/workspace.yml` থেকে Moon প্রজেক্টগুলো খুঁজে পায়:

```yaml
projects:
  - 'packages/nodeloop'
  - 'crates/*'
  - 'tooling'

vcs:
  client: 'git'
  defaultBranch: 'main'
  provider: 'github'

versionConstraint: '>=2.0.0'
```

- `packages/nodeloop` — TypeScript CLI
- `crates/*` — Rust Crate (`nodeloop-core`, `nodeloop-native`)
- `tooling` — বিল্ড ও স্ক্রিপ্ট

## প্রজেক্ট-লেভেল moon.yml

মুন v2-এ টাস্ক ইনহেরিটেন্সি `inheritedBy` সেটিংস দিয়ে কন্ট্রোল করা হয়। `.moon/tasks/` ফোল্ডারে ভাষা-ভিত্তিক আর্কিটাইপ ফাইল রয়েছে:

- `.moon/tasks/all.yml` — ওয়ার্কস্পেস-স্তরের টাস্ক (সব প্রজেক্টে প্রযোজ্য)
- `.moon/tasks/node.yml` — শুধু TypeScript/JavaScript প্রজেক্টে (`inheritedBy: languages: [typescript, javascript]`)
- `.moon/tasks/rust.yml` — শুধু Rust প্রজেক্টে (`inheritedBy: languages: [rust]`)
- `.moon/tasks/test.yml`, `coverage.yml`, `release.yml` — সিস্টেম-স্তরের মেটা-টাস্ক

প্রতিটি প্রজেক্টের নিজস্ব `moon.yml` ফাইলে শুধু `language` সেট করা আছে:

- `packages/nodeloop/moon.yml` — `language: 'typescript'`
- `crates/nodeloop-core/moon.yml` — `language: 'rust'`
- `crates/nodeloop-native/moon.yml` — `language: 'rust'`
- `tooling/moon.yml` — `language: 'typescript'`

মুন স্বয়ংক্রিয়ভাবে শুধু সেই প্রজেক্টের ভাষার সাথে মেলে खाने আর্কিটাইপটি প্রযোজ্য করে।

## Moon CLI কমান্ড

একটি প্রজেক্টের টাস্ক রান করুন:

```bash
moon run <প্রজেক্ট>:<টাস্ক>
```

উদাহরণ:

```bash
moon run nodeloop:typecheck
moon run nodeloop:build
moon run nodeloop:lint
moon run nodeloop:test
moon run nodeloop-core:build
moon run nodeloop-core:test
moon run nodeloop-native:check
```

সব প্রজেক্টে টাস্ক রান করুন:

```bash
moon run :test --all
```

শুধু পরিবর্তিত প্রজেক্টে:

```bash
moon run :test --affected
```

টাস্ক তালিকা দেখুন:

```bash
moon tasks
moon tasks nodeloop
```

কনফিগ যাচাই:

```bash
moon check
moon sync
```

Moon আপগ্রেড:

```bash
moon upgrade
```

সিআই রান:

```bash
moon ci
moon affected
```

## টাস্ক তালিকা

### nodeloop (TypeScript CLI)

| টাস্ক           | কমান্ড                            | ব্যাখ্যা         |
| --------------- | --------------------------------- | ---------------- |
| `build`         | `moon run nodeloop:build`         | TypeScript বিল্ড |
| `typecheck`     | `moon run nodeloop:typecheck`     | টাইপ চেক         |
| `lint`          | `moon run nodeloop:lint`          | ESLint লিন্ট     |
| `test`          | `moon run nodeloop:test`          | Vitest টেস্ট     |
| `test-coverage` | `moon run nodeloop:test-coverage` | কভারেজসহ টেস্ট   |

### nodeloop-core (Rust Crate)

| টাস্ক           | কমান্ড                                 | ব্যাখ্যা     |
| --------------- | -------------------------------------- | ------------ |
| `build`         | `moon run nodeloop-core:build`         | Rust বিল্ড   |
| `build-release` | `moon run nodeloop-core:build-release` | রিলিজ বিল্ড  |
| `check`         | `moon run nodeloop-core:check`         | কোড চেক      |
| `test`          | `moon run nodeloop-core:test`          | টেস্ট রান    |
| `lint`          | `moon run nodeloop-core:lint`          | Clippy লিন্ট |
| `fmt`           | `moon run nodeloop-core:fmt`           | ফরম্যাট চেক  |
| `fmt-write`     | `moon run nodeloop-core:fmt-write`     | ফরম্যাট রাইট |

### nodeloop-native (Rust Crate)

একই টাস্ক, প্রিফিক্স `nodeloop-native`:

```bash
moon run nodeloop-native:build
moon run nodeloop-native:check
moon run nodeloop-native:test
moon run nodeloop-native:fmt
```

### tooling (Node.js)

| টাস্ক   | কমান্ড                   | ব্যাখ্যা     |
| ------- | ------------------------ | ------------ |
| `build` | `moon run tooling:build` | টুলিং বিল্ড  |
| `lint`  | `moon run tooling:lint`  | ESLint লিন্ট |
| `test`  | `moon run tooling:test`  | Vitest টেস্ট |

## ক্যাশ

Moon ডিফল্টভাবেই টাস্ক আউটপুট ক্যাশ করে। ক্যাশ ক্লিয়ার করুন:

```bash
moon cache clean
```

`.moon/cache/` ফোল্ডারে ক্যাশ সংরক্ষিত থাকে।

## ট্রাবলশুটিং

| সমস্যা               | সমাধান                                          |
| -------------------- | ----------------------------------------------- |
| Moon পাওয়া যায়নি     | `moon --version` রান করুন                       |
| টাস্ক ফেইল হয়        | `--no-cache` বা `moon cache clean` ব্যবহার করুন |
| টুলচেইন ভুল          | `.moon/toolchains.yml` চেক করুন                 |
| প্রজেক্ট খুঁজে পায়নি | `workspace.yml` গ্লোব চেক করুন                  |

## রেফারেন্স

- [Moon ওয়ার্কস্পেস কনফিগ](https://moonrepo.dev/docs/config/workspace)
- [Moon টাস্ক কনফিগ](https://moonrepo.dev/docs/config/tasks)
- [Moon CLI রেফারেন্স](https://moonrepo.dev/docs/cli)

এই গাইডটি nodeloop প্রজেক্টের Moon কনফিগের ওপর ভিত্তি করে তৈরি। কনফিগ বদলে গেলে গাইড আপডেট করুন।
