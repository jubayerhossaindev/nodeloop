# nodeloop CLI টেস্ট গাইড (বাংলা)

এই গাইডে আপনি সেরে নেবেন কীভাবে nodeloop CLI-এর প্রতিটি অপশন এবং ফিচার টেস্ট করতে হয়। সব কমান্ড একে একে রান করে দেখতে পারবেন কাজ করছে কি না।

---

## অধ্যায় ১: প্রস্তুতি

নিশ্চিত হয়েন যে প্রজেক্ট বিল্ড করা হয়েছে:

```bash
npm run build
```

এবং নেটিভ রাস্ট বাইনারি তৈরি করা হয়েছে:

```bash
npm run build:native
```

টেস্ট ফোল্ডারটি এখানে অবস্থিত:

```text
cli-test/
├── apps/
│   ├── basic.js            # বেসিক অটো-রিস্টার্ট টেস্ট
│   ├── args-app.js         # স্ক্রিপ্ট আর্গুমেন্ট পাস-থ্রু টেস্ট
│   ├── crash-app.js        # ক্র্যাশ রিকভারি টেস্ট
│   ├── exit-app.js         # ক্লিন এক্সিট টেস্ট
│   ├── env-app.js          # এনভ ভেরিয়েবল টেস্ট
│   ├── color-app.js        # রং টেস্ট
│   ├── config-script-app.js # কনফিগ স্ক্রিপ্ট কী টেস্ট
│   ├── delay-app.js        # ডিবাউন্স ডিলে টেস্ট
│   ├── env-config-app.js   # কনফিগ থেকে এনভ ভেরিয়েবল টেস্ট
│   ├── error-app.js        # এরর হ্যান্ডলিং টেস্ট
│   ├── exec-app.js         # এক্সিকিউট কমান্ড টেস্ট
│   ├── ignore-app.js       # ইগনোর ডিরেক্টরি টেস্ট
│   ├── kill-signal-app.js  # কিল সিগন্যাল টেস্ট
│   ├── legacy-watch-app.js # লেগাসি ওয়াচ টেস্ট
│   ├── max-wait-app.js     # সর্বোচ্চ অপেক্ষা টেস্ট
│   ├── node-args-app.js    # নোড আর্গুমেন্ট টেস্ট
│   ├── quiet-app.js        # কুয়াইট মোড টেস্ট
│   ├── restartable-app.js  # ম্যানুয়াল রিস্টার্ট টেস্ট
│   ├── verbose-app.js      # ভার্বোজ মোড টেস্ট
│   └── watch-path-app.js   # ওয়াচ পাথ টেস্ট
├── configs/
│   ├── nodeloop.json     # JSON কনফিগ
│   ├── nodeloop.toml     # TOML কনফিগ
│   ├── nodeloop.yaml     # YAML কনফিগ
│   ├── nodeloop.yml      # YAML কনফিগ (.yml)
│   ├── nodeloop.js       # JS কনফিগ (CommonJS)
│   ├── nodeloop.mjs      # JS কনফিগ (ESM)
│   ├── nodeloop.ts       # TypeScript কনফিগ
│   ├── nodeloop.mts      # TypeScript কনফিগ (ESM)
│   └── .nodelooprc       # লুকিয়ে রাখা rc কনফিগ (JSON)
├── .nodelooprc           # রুট লেভেল rc ফাইল (অটো-ডিটেক্ট)
└── package.json
```

---

## অধ্যায় ২: বেসিক কমান্ড টেস্ট

### ২.১ ভার্সন চেক

```bash
node packages/nodeloop/dist/cli.js --version
```

**আপেক্ষিত আউটপুট:**

```text
[nodeloop] 1.0.0
```

### ২.২ হেলপ পেজ

```bash
node packages/nodeloop/dist/cli.js --help
```

**আপেক্ষিত আউটপুট:** পূর্ণ হেলপ পেজ দেখাবে যাতে সব অপশনের তালিকা থাকবে।

### ২.৩ সাধারণ অ্যাপ রান

```bash
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:**

```text
[nodeloop] 1.0.0
[nodeloop] watching path(s): .
[nodeloop] watching extensions: js,mjs,cjs,json
[nodeloop] > starting `node cli-test/apps/basic.js`
TICK 0 - 2026-...
TICK 1 - 2026-...
TICK 2 - 2026-...
```

---

## অধ্যায় ৩: সমস্ত CLI ফ্ল্যাগ টেস্ট

### ৩.১ এক্সটেনশন ফিল্টার (`-e`, `--ext`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -e ts cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** `watching extensions: ts` দেখাবে।

```bash
timeout 3 node packages/nodeloop/dist/cli.js --ext=ts cli-test/apps/basic.js
```

### ৩.২ ইগনোর ডিরেক্টরি (`-i`, `--ignore`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -i uploads,logs cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** ইগনোর লিস্টে `uploads,logs` যোগ হবে।

### ৩.৩ Watch পাথ (`-w`, `--watch`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -w cli-test/apps cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** শুধু `cli-test/apps` পাথ নজরে থাকবে।

### ৩.৪ ডিবাউন্স ডিলে (`-d`, `--delay`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -d 500 cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** `delay: 500ms` দেখাবে।

### ৩.৫ সর্বোচ্চ অপেক্ষা (`-m`, `--max-wait`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -m 1000 cli-test/apps/basic.js
```

### ৩.৬ এক্সিকিউট কমান্ড (`-x`, `--exec`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -x "node --inspect" cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** `node --inspect cli-test/apps/basic.js` দেখাবে।

### ৩.৭ নোড আর্গুমেন্ট (`--node-args`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js --node-args "--inspect" cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** ডিবাগার শুনতে পাবে।

### ৩.৮ কনফিগ ফাইল পাথ (`--config`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.json cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** `config: nodeloop.json` দেখাবে।

### ৩.৯ ভার্বোজ মোড (`-v`, `--verbose`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -v cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** ডিরেক্টরি, ডিলে, ইগনোর লিস্ট ইত্যাদি বিস্তারিত দেখাবে।

### ৩.১০ কুয়াইট মোড (`-q`, `--quiet`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js -q cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:** শুধু অ্যাপ আউটপুট, ব্যানার বন্ধ থাকবে।

### ৩.১১ রং (`--color`, `--no-color`)

```bash
timeout 3 node packages/nodeloop/dist/cli.js --color cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --no-color cli-test/apps/basic.js
```

---

## অধ্যায় ৪: স্ক্রিপ্ট আর্গুমেন্ট এবং `--` সেপারেটর

### ৪.১ স্ক্রিপ্টে আর্গুমেন্ট পাস

```bash
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/args-app.js --port 3000 --env prod
```

**আপেক্ষিত আউটপুট:**

```text
ARGV: [ '--port', '3000', '--env', 'prod' ]
```

### ৪.২ `--` সেপারেটর

```bash
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/args-app.js -- --port 3000 --config
```

**আপেক্ষিত আউটপুট:** `--`-এর পরের সবকিছু অ্যাপে পাস হবে, নোডলুপ ফ্ল্যাগ হিসেবে গণ্য হবে না।

---

## অধ্যায় ৫: স্ক্রিপ্ট রেজোলিউশন

### ৫.১ কোনো স্ক্রিপ্ট না দিলে (ডিফল্ট চেইন)

```bash
timeout 3 node packages/nodeloop/dist/cli.js
```

**প্রাধানতা:** `package.json` main → `index.js` → `server.js`

### ৫.২ CLI আর্গুমেন্ট দিলে

```bash
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/basic.js
```

CLI আর্গুমেন্ট সবসময় অগ্রাধিকার পাবে।

---

## অধ্যায় ৬: `.nodelooprc` কনফিগ ফাইল (লুকিয়ে রাখা)

`.nodelooprc` হলো নোডলুপের একটি লুকিয়ে রাখা কনফিগ ফাইল। এটিতে ডট (`.`) দিয়ে শুরু হয়, তাই লinux/macOS-এ `ls` কমান্ডে সাধারণত এটি চোখে পড়ে না।

### ৬.১ `.nodelooprc` কেন ব্যবহার করবেন?

- গোপন কনফিগ রাখা যা গিটে কমিট করতে না চাইবেন (এনভ ভেরিয়েবল, API কী ইত্যাদি)
- অটো-ডিটেকশন চেইনের دوسرا অটো-ডিটেক্ট ফাইল (`nodeloop.json`-এর পরের)
- নোডমন স্টাইলের rc ফিল গাইডলাইন অনুযায়ী

### ৬.২ `.nodelooprc` ফরম্যাট

`.nodelooprc` ফাইলটি JSON ফরম্যাটে হয়। এটি BOM Tolerance সমর্থন করে (অতিরিক্ত বাইট থাকলেও পার্স হবে)।

### ৬.৩ `.nodelooprc` টেস্ট করুন

১. `cli-test/` ডিরেক্টরিতে যান:

```bash
cd cli-test
```

২. ক্লাই রান করুনভার্বোজ মোডে:

```bash
timeout 3 node ../packages/nodeloop/dist/cli.js --verbose apps/basic.js
```

**আপেক্ষিত আউটপুট:**

```text
[nodeloop] config: .nodelooprc
[nodeloop] delay: 300ms
[nodeloop] ignore: node_modules, logs, uploads, .git, .npm, coverage, .DS_Store
```

এখানে `config: .nodelooprc` দেখাবে যে ফাইলটি শনাক্ত হয়েছে। `delay: 300ms` দেখাবে যে ডিফল্ট 200ms কে `.nodelooprc`-এর 300ms দিয়ে ওভাররাইড করা হয়েছে।

### ৬.৪ অটো-ডিটেকশন অর্ডার (প্রথম মেল খুঁজে পেলেই শেষ)

| ক্রম | ফাইল                         | ফরম্যাট               |
| ---- | ---------------------------- | --------------------- |
| ১    | `nodeloop.json`              | JSON                  |
| ২    | `.nodelooprc`                | JSON (BOM tolerant)   |
| ৩    | `nodeloop.toml`              | TOML                  |
| ৪    | `nodeloop.yaml`              | YAML                  |
| ৫    | `nodeloop.yml`               | YAML (.yml)           |
| ৬    | `nodeloop.js`                | JavaScript (CommonJS) |
| ৭    | `nodeloop.mjs`               | JavaScript (ESM)      |
| ৮    | `nodeloop.ts`                | TypeScript            |
| ৯    | `nodeloop.mts`               | TypeScript (ESM)      |
| শেষ  | `package.json` "nodeloop" কী | JSON                  |

প্রথম মিল পাওয়া ফাইলের কনফিগ ব্যবহার করা হয়; বাকিগুলো উপেক্ষা করা হয়।

---

## অধ্যায় ৭: অন্যান্য কনফিগ ফাইল টেস্ট (সব ফরম্যাট)

### ৭.১ JSON কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.json cli-test/apps/basic.js
```

### ৭.২ TOML কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.toml cli-test/apps/basic.js
```

### ৭.৩ YAML কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.yaml cli-test/apps/basic.js
```

### ৭.৫ YAML (.yml) কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.yml cli-test/apps/basic.js
```

### ৭.৬ JavaScript (CommonJS) কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.js cli-test/apps/basic.js
```

### ৭.৭ JavaScript (ESM) কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.mjs cli-test/apps/basic.js
```

### ৭.৮ TypeScript কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.ts cli-test/apps/basic.js
```

### ৭.৯ TypeScript (ESM) কনফিগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.mts cli-test/apps/basic.js
```

---

## অধ্যায় ৮: কনফিগ কী (Config Keys) টেস্ট

### ৮.১ এনভ ভেরিয়েবল (`env`)

নতুন ফাইল তৈরি করুন `cli-test/apps/env-app.js`:

```javascript
console.log('TEST_VAR =', process.env.TEST_VAR);
```

তারপর রান করুন:

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.json cli-test/apps/env-app.js
```

**আপেক্ষিত আউটপুট:** `TEST_VAR = hello-from-config`

### ৮.২ কিল সিগন্যাল (`killSignal`)

কনফিগে `"killSignal": "SIGINT"` সেট থাকলে ক্লাই স্ক্রিপ্ট বন্ধ করার সময় SIGINT পাঠাবে।

### ৮.৩ কিল টাইমআউট (`killTimeout`)

কনফিগে `"killTimeout": 5000` সেট থাকলে স্ক্রিপ্ট বন্ধ করার আগে ৫ সেকেন্ড অপেক্ষা করবে।

### ৮.৪ রিস্টার্টেবল (`restartable`)

কনফিগে `"restartable": "rs"` সেট থাকলে TTY-তে `rs` টাইপ করলে ম্যানুয়াল রিস্টার্ট হবে।

### ৮.৫ রং (`colours`)

কনফিগে `"colours": false` সেট করলে রঙ বন্ধ থাকবে।

### ৮.৬ লেগাসি ওয়াচ (`legacyWatch`)

কনফিগে `"legacyWatch": true` সেট থাকলে ১ সেকেন্ডে একবার পোলিং করবে।

---

## অধ্যায় ৯: অটো-রিস্টার্ট টেস্ট (মुख্য ফিচার)

### ৯.১ ফাইল পরিবর্তন দিয়ে রিস্টার্ট

১. টার্মিনালে রান করুন:

```bash
node packages/nodeloop/dist/cli.js --verbose cli-test/apps/basic.js
```

২. অন্য একটি টার্মিনালে ফাইলটি এডিট করুন:

```bash
echo 'console.log("FILE CHANGED", Date.now());' >> cli-test/apps/basic.js
```

**আপেক্ষিত আউটপুট:**

```text
[nodeloop] file change detected: cli-test/apps/basic.js
[nodeloop] restart queued (debounce 200ms)
[nodeloop] debounce completed
[nodeloop] > restarting due to changes...
[nodeloop] > stopping previous process
[nodeloop] > starting `node cli-test/apps/basic.js`
```

### ৯.২ ম্যানুয়াল রিস্টার্ট (`rs`)

TTY-তে ক্লাই রান করুন তারপর `rs` টাইপ করে এন্টার চাপুন:

```text
[nodeloop] > restarting manually...
```

### ৯.৩ ক্লিন এক্সিট

নতুন ফাইল তৈরি করুন `cli-test/apps/exit-app.js`:

```javascript
console.log('EXITING IMMEDIATELY');
process.exit(0);
```

রান করুন:

```bash
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/exit-app.js
```

**আপেক্ষিত আউটপুট:** `+ clean exit - waiting for changes before restart`

### ৯.৪ ক্র্যাশ রিকভারি

নতুন ফাইল তৈরি করুন `cli-test/apps/crash-app.js`:

```javascript
console.log('CRASHING...');
setTimeout(() => {
  throw new Error('INTENTIONAL CRASH');
}, 1000);
```

রান করুন:

```bash
timeout 5 node packages/nodeloop/dist/cli.js --verbose cli-test/apps/crash-app.js
```

**আপেক্ষিত আউটপুট:**

```text
[nodeloop] x app crashed — exit code 1
[nodeloop] o watching for changes
[nodeloop] fix the error and save a file to retry
```

---

## অধ্যায় ১০: এরর হ্যান্ডলিং টেস্ট

### ১০.১ স্ক্রিপ্ট খুঁজে পাওয়া যায় না

```bash
timeout 3 node packages/nodeloop/dist/cli.js /nonexistent/app.js
```

**আপেক্ষিত আউটপুট:**

```text
[x] script not found: /nonexistent/app.js
run from your project directory, or check the path — e.g. nodeloop server.js
```

### ১০.২ কনফিগ ফাইল খুঁজে পাওয়া যায় না

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config /nonexistent/nodeloop.json
```

**আপেক্ষিত আউটপুট:**

```text
[x] config file not found: /nonexistent/nodeloop.json
supported: nodeloop.json - .nodelooprc - nodeloop.toml - nodeloop.yml - nodeloop.js - nodeloop.ts
```

### ১০.৩ ইনভ্যালिड JSON কনফিগ

একটি ভুল JSON ফাইল তৈরি করুন তারপর রান করুন:

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.json
```

(কনফিগ ফাইলেintentional ত্রুটি যোগ করুন)

**আপেক্ষিত আউটপুট:**

```text
[x] invalid configuration
nodeloop.json: Expected property name or '}' in JSON at position 2
check the configuration and run again
```

### ১০.৪ `lag` কমান্ড

```bash
timeout 3 node packages/nodeloop/dist/cli.js lag
```

**আপেক্ষিত আউটপুট:**

```text
[x] script not found: lag — nodeloop has no lag monitor
to run your app: nodeloop app.js · or nodeloop --help
```

---

## অধ্যায় ১১: পূর্ণ টেস্ট চেকলিস্ট

নিচের টেবিলটি প্রিন্ট করে হাতে চেক করতে পারেন:

| #   | টেস্ট                  | কমান্ড                      | আপেক্ষিত ফলাফল          | স্ট্যাটাস |
| --- | ---------------------- | --------------------------- | ----------------------- | --------- |
| ১   | ভার্সন                 | `--version`                 | `[nodeloop] 1.0.0`      | ☐         |
| ২   | হেলপ                   | `--help`                    | হেলপ পেজ                | ☐         |
| ৩   | সাধারণ রান             | `cli.js app.js`             | টিক প্রিন্ট             | ☐         |
| ৪   | এক্সটেনশন              | `-e ts`                     | `extensions: ts`        | ☐         |
| ৫   | ইগনোর                  | `-i uploads`                | ইগনোর লিস্ট             | ☐         |
| ৬   | ওয়াচ পাথ               | `-w path`                   | ওই পাথ নজরে             | ☐         |
| ৭   | ডিলে                   | `-d 500`                    | `delay: 500ms`          | ☐         |
| ৮   | ম্যাক-ওয়েট             | `-m 1000`                   | কাজ করে                 | ☐         |
| ৯   | এক্সেক                 | `-x "node"`                 | এক্সেক কমান্ড           | ☐         |
| ১০  | নোড-আর্গ               | `--node-args`               | ডিবাগার                 | ☐         |
| ১১  | কনফিগ                  | `--config json`             | `config: filename`      | ☐         |
| ১২  | `.nodelooprc`          | রুটে `.nodelooprc` রেখে রান | `config: .nodelooprc`   | ☐         |
| ১৩  | ভার্বোজ                | `-v`                        | বিস্তারিত লগ            | ☐         |
| ১৪  | কুয়াইট                 | `-q`                        | শুধু অ্যাপ আউটপুট       | ☐         |
| ১৫  | রঙ অন                  | `--color`                   | ANSI রঙ                 | ☐         |
| ১৬  | রঙ বন্ধ                | `--no-color`                | প্লেন টেক্সট            | ☐         |
| ১৭  | স্ক্রিপ্ট আর্গ         | `app.js --port 3000`        | argv পাস                | ☐         |
| ১৮  | সেপারেটর               | `app.js -- --flag`          | `--` পরের জিনিস অ্যাপে  | ☐         |
| ১৯  | প্যাকেজবাংলা main      | কোনো স্ক্রিপ্ট না দিয়ে      | `index.js` রান          | ☐         |
| ২০  | সার্ভার.js ফলব্যাক     | কোনো স্ক্রিপ্ট না দিয়ে      | `server.js` রান         | ☐         |
| ২১  | কনফিগ স্ক্রিপ্ট        | কনফিটে script কী            | কনফিট থেকে পথ           | ☐         |
| ২২  | JSON কনফিগ             | `--config .json`            | কনফিগ লোড               | ☐         |
| ২৩  | TOML কনফিগ             | `--config .toml`            | কনফিগ লোড               | ☐         |
| ২৪  | YAML (.yaml) কনফিগ     | `--config .yaml`            | কনফিগ লোড               | ☐         |
| ২৫  | YAML (.yml) কনফিগ      | `--config .yml`             | কনফিগ লোড               | ☐         |
| ২৬  | JS (CommonJS) কনফিগ    | `--config .js`              | কনফিগ লোড               | ☐         |
| ২৭  | JS (ESM) কনফিগ         | `--config .mjs`             | কনফিগ লোড               | ☐         |
| ২৮  | TypeScript কনফিগ       | `--config .ts`              | কনফিগ লোড               | ☐         |
| ২৯  | TypeScript (ESM) কনফিগ | `--config .mts`             | কনফিগ লোড               | ☐         |
| ৩০  | এনভ ভের                | `env` কনফিগ                 | `TEST_VAR` প্রিন্ট      | ☐         |
| ৩১  | কিল সিগন্যাল           | `killSignal`                | সিগন্যাল পাঠাবে         | ☐         |
| ৩২  | অটো-রিস্টার্ট          | ফাইল মডিফাই                 | রিস্টার্ট হবে           | ☐         |
| ৩৩  | ম্যানুয়াল রিস্টার্ট   | `rs` টাইপ                   | ম্যানুয়াল রিস্টার্ট    | ☐         |
| ৩৪  | ক্লিন এক্সিটি          | `exit-app.js`               | `clean exit`            | ☐         |
| ৩৫  | ক্র্যাশ রিকভারি        | `crash-app.js`              | `app crashed`           | ☐         |
| ৩৬  | স্ক্রিপ্ট নেই          | নেই পথ                      | `script not found`      | ☐         |
| ৩৭  | কনফিগ নেই              | ভুল পথ                      | `config not found`      | ☐         |
| ৩৮  | ভুল JSON               | ভুল ফাইল                    | `invalid configuration` | ☐         |
| ৩৯  | লাগ কমান্ড             | `lag`                       | `no lag monitor`        | ☐         |

---

## অধ্যায় ১২: সমস্যা সমস্যা (Troubleshooting)

### সমস্যা ১: নেটিভ বাইনারি খুঁজে পায় না

```bash
[x] native watcher unavailable: no binary found for linux-x64
```

**সমাধান:**

```bash
npm run build:native
```

### সমস্যা ২: স্ক্রিপ্ট খুঁজে পায় না

**সমাধান:** সঠিক পাথ দিন অথবা প্রজেক্ট রুট থেকে রান করুন।

### সমস্যা ৩: কনফিগ ফাইল লোড হয় না

**সমাধান:** `--config` ফ্ল্যাগে পূর্ণ পাথ দিন অথবা কনফিগ ফাইলটি প্রজেক্ট রুটে রাখুন।

---

## অধ্যায় ১৩: ডেভেলপার নোট

- সব কমান্ড `packages/nodeloop/dist/cli.js` থেকে রান করতে হবে।
- টাইপস্ক্রিপ্ট সোর্স `packages/nodeloop/src/` ফোল্ডারে আছে।
- রাস্ট নেটিভ কোর `crates/nodeloop-core/` ফোল্ডারে আছে।
- নেটিভ ব্রিজ `crates/nodeloop-native/` ফোল্ডারে আছে।
- `.nodelooprc` ফাইলে `.` দিয়ে শুরু হয়, তাই `ls -a` কমান্ড দিয়ে দেখতে হবে।

---

## অধ্যায় ১৪: আপনার টার্মিনালে সব কমান্ড টেস্ট করুন

নিচের সমস্ত কমান্ড আপনার টার্মিনালে একে একে রান করে দেখুন কাজ করছে কি না। সব কমান্ড `packages/nodeloop/dist/cli.js` থেকে রান করতে হবে।

### ১৪.১ বিল্ড

```bash
npm run build
npm run build:native
```

### ১৪.২ ভার্সন ও হেলপ

```bash
node packages/nodeloop/dist/cli.js --version
node packages/nodeloop/dist/cli.js --help
```

### ১৪.৩ বেসিক রান

```bash
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/basic.js
```

### ১৪.৪ সব CLI ফ্ল্যাগ

```bash
timeout 3 node packages/nodeloop/dist/cli.js -e ts cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js -i uploads cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js -w cli-test/apps cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js -d 500 cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js -m 1000 cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js -x "node" cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --node-args "--inspect" cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.json cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js -v cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js -q cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --color cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --no-color cli-test/apps/basic.js
```

### ১৪.৫ স্ক্রিপ্ট আর্গুমেন্ট

```bash
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/args-app.js --port 3000
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/args-app.js -- --port 3000
```

### ১৪.৬ সকল কনফিগ ফরম্যাট

```bash
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.json cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.toml cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.yaml cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.yml cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.js cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.mjs cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.ts cli-test/apps/basic.js
timeout 3 node packages/nodeloop/dist/cli.js --config cli-test/configs/nodeloop.mts cli-test/apps/basic.js
```

### ১৪.৭ এরর হ্যান্ডলিং

```bash
timeout 3 node packages/nodeloop/dist/cli.js /nonexistent/app.js
timeout 3 node packages/nodeloop/dist/cli.js --config /nonexistent/nodeloop.json
timeout 3 node packages/nodeloop/dist/cli.js lag
```

### ১৪.৮ ক্র্যাশ ও রিস্টার্ট

```bash
timeout 5 node packages/nodeloop/dist/cli.js --verbose cli-test/apps/crash-app.js
timeout 3 node packages/nodeloop/dist/cli.js cli-test/apps/exit-app.js
```

---

এই গাইড ফলো করে আপনি nodeloop CLI-এর প্রতিটি ফিচার সেরে নিতে পারবেন। সব টেস্ট পাস হলে আপনার CLI পুরোপুরি ওয়ার্কিং। শুভকামনা!
