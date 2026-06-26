/**
 * Traduções PT → EN (pontuais, criadas na migração).
 * Usado por build-posts-en.ts para gerar data/posts-en.json.
 */
export interface EnTranslation {
  title: string;
  description: string;
  body_html: string;
}

export const EN_TRANSLATIONS: Record<string, EnTranslation> = {
  "ciencia-de-dados-e-matematica": {
    title: "Data Science and Mathematics",
    description: "For me, a much bigger challenge than learning to code.",
    body_html: `<p>Many years ago I decided that programming would be a natural path for my career as a <em>Web Designer</em>, which I had been doing for almost three years. To land more freelance work I got involved with WordPress and gradually explored PHP until I could call myself a "WordPress developer" — ask me to build a custom post type, but don't ask me for a dedicated class to handle images, for example. That's how I approached the programming world for the last 15 years: Python came along, JS frameworks, Node.js, and lots of infrastructure with Linux, CI/CD, and so on.</p>

<h2>And now for something completely different.</h2>
<p>Data has always been a curiosity of mine. From political polls on TV talking about the famous "margin of error" that left me wondering (why 2 points and not 4 or 6? And why plus or minus? Did nobody reach a conclusion?); with the rise of infographics I was fascinated by the limitless creativity to illustrate all kinds of data, even when it became impossible to understand because of unconventional layouts.</p>

<p>Following the rapid evolution of Machine Learning and AI, plus so many other interests in journalism, politics, sports, and a little experience working alongside data teams at companies I've been through, it seems increasingly clear that this is my new challenge: Data Science and all the complexity around it — because the foundation of this field is exactly my weakness: Mathematics, and that changes everything.</p>

<h2>How to learn how to learn?</h2>
<p>Look, I don't struggle with the subject — I have complete dread, a real trigger! I'll never forget that my highest geometry grade ever was a tearful 3 out of 10, and that matters because illustrating problems seems very important from what I see when researching math topics.</p>

<p>So I seek all the help I can, because unlike programming where being self-taught is essential to stay current, in data science I need as many mentors as possible to understand years of mathematical knowledge I have no idea how works.</p>

<p>I'm currently taking an online course and an elective on Data Science; to raise my math level I went back to zero and I'm following Khan Academy tracks on the subject. On Amazon I have some books saved for a future purchase, while on YouTube the number of videos on the topic only grows.</p>

<h2>Accountability — why not?</h2>
<p>One thing that always works is asking friends for help to stay accountable with studies. That's what I'm doing here — I'm asking for your help too to stay on track, and I'll use this space to document everything I learn in this area.</p>

<p>Thank you, and see you soon. 😄</p>`,
  },
  "web-components-exemplos-e-overview": {
    title: "Web Components — Examples and Overview",
    description: "How to use Web Components in everyday projects",
    body_html: `<p>Web Components are already a reality and many of us work every day with JS frameworks like React, Vue, or Angular — but what if we want that same flexibility in a plain HTML project?</p>

<h2>How it works</h2>
<p>A Web Component is the result of three different specifications: <strong>Custom Elements</strong>, <strong>Shadow DOM</strong>, and <strong>HTML Templates</strong>.</p>

<h3>Custom Elements</h3>
<p>This specification is responsible for creating and managing customizable HTML elements. Through its <code>.define()</code> method we enable a new tag to be used on the page.</p>
<p>We define our new element using a <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes" target="_blank" rel="noopener">class in JS</a>.</p>

<h2>Shadow DOM</h2>
<p>Creating a new element means inserting potential conflicts into a page that already has many tags, scripts, and CSS. Shadow DOM removes that conflict by <em>encapsulating</em> everything you need inside a <strong>shadow root</strong> — like a new HTML document inside the element.</p>

<p><strong>Any element can have a Shadow DOM</strong> — you can manipulate that structure without worrying about conflicts with the main document because they are separate trees.</p>

<h2>HTML template tag</h2>
<p>If you come from Vue.js you're already familiar with these tags. What I didn't know is that they are W3C recommendations!</p>

<p><code>&lt;template&gt;</code> and <code>&lt;slot&gt;</code> accept content but render nothing when the page loads. They also provide a way to be manipulated via JavaScript to create HTML structures equivalent to the JS code we need (like named slots).</p>

<h2>Demo</h2>
<p>I created a <a href="https://github.com/rhamses/ans-tag" target="_blank" rel="noopener">Web Component to display a health plan ANS number</a>. Because it's an HTML tag you can resize it by changing the tag's <code>font-size</code>.</p>
<img src="https://raw.githubusercontent.com/rhamses/ans-tag/main/demo/ans-demo.gif" alt="ANS tag demo" loading="lazy" />

<h2>Reference sites</h2>
<p>- <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_components" target="_blank" rel="noopener">MDN</a></p>
<p>- <a href="https://www.webcomponents.org" target="_blank" rel="noopener">WebComponents.org</a></p>

<h2>Frameworks that help day to day</h2>
<p>- <a href="https://lit.dev" target="_blank" rel="noopener">Lit</a></p>
<p>- <a href="https://polymer-library.polymer-project.org" target="_blank" rel="noopener">Polymer</a></p>
<p>- <a href="https://stenciljs.com" target="_blank" rel="noopener">Stencil</a></p>`,
  },
  "cloudflare-service-worker": {
    title: "Cloudflare Service Worker",
    description: "Manipulate your site without a backend. Get ready for edge computing.",
    body_html: `<p>Imagine manipulating requests to your site without a web server instance? Running A/B tests, redirecting traffic without editing a line of Apache or Nginx. These are just some of the qualities of <strong>edge computing</strong>.</p>

<h2>Edge Computing and Workers</h2>
<p>It's a term for scripts that run close to the client that made the request. <a href="https://blog.cloudflare.com/introducing-cloudflare-workers/" target="_blank" rel="noopener">Cloudflare was the first</a> company to launch this strategy back in 2017, and since then other companies support this hosting and development model. The main benefits are:</p>
<ul>
<li><strong>Performance:</strong> because responses happen near the client's geography, load time drops below <strong>50ms!!</strong></li>
<li><strong>Value:</strong> there's a free tier for a Cloudflare Worker that covers many use cases, and if you need to pay it starts at just <strong>$5/month</strong></li>
<li><strong>Ease:</strong> all you need is JavaScript! Request manipulation uses the same Web Worker API browsers already use — no more worrying about web servers.</li>
</ul>

<h2>Example: Redirecting a subdomain to routes</h2>
<p>A good custom example I needed was creating the route for this blog! Originally the address was a Cloudflare subdomain <code>rhamses-blog.pages.dev</code> but I wanted it accessed via <a href="https://rhams.es/blog" target="_blank" rel="noopener"><strong>rhams.es/blog</strong></a></p>

<h3>Creating a Cloudflare Pages instance</h3>
<p>The first step was creating an instance on Cloudflare Pages. The blog was originally hosted on <a href="https://netlify.com" target="_blank" rel="noopener">netlify.com</a> but for stack compatibility I moved everything to Cloudflare. Creation is practically the same — link your GitHub profile or upload the final files directly.</p>
<img src="/api/media/uploads/blog/cloudflare-service-worker/image1.png" alt="Cloudflare Pages subdomain" loading="lazy" />

<h3>Creating a Service Worker for redirection</h3>
<p>Now we get to the point! To create a service worker we write JavaScript following the <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API" target="_blank" rel="noopener">Web Worker API</a> conventions.</p>
<img src="/api/media/uploads/blog/cloudflare-service-worker/image2.png" alt="Create Cloudflare Worker" loading="lazy" />

<p>The worker code intercepts requests and rewrites paths so <code>rhams.es/blog</code> serves content from the Pages deployment. See the full post images for step-by-step screenshots of the dashboard and final configuration.</p>`,
  },
  "consultando-a-tabela-fipe-via-api": {
    title: "Querying the FIPE Table via API",
    description: "A new way to query the FIPE table programmatically.",
    body_html: `<p>The <a href="https://veiculos.fipe.org.br" target="_blank" rel="noopener">FIPE Table</a> is an excellent research resource for anyone who owns or plans to buy a car. Standardizing the average price of new and used cars greatly facilitates negotiation and, in a way, feeds pricing across the entire automotive market chain.</p>

<p>Because of that, many people dream of having access to this data as an API to embed in their own applications. The problem is that FIPE (yes, that's the foundation's name, not the car price table) doesn't provide this structured data for queries.</p>

<p>There are some initiatives online to turn this data into an API, but they all lack something: up-to-date data, endpoint performance, configuration difficulty, and so on...</p>

<h2><a href="https://fipe.amb1.io" target="_blank" rel="noopener">Enter my idea => fipe.amb1.io</a></h2>
<video src="/api/media/uploads/blog/consultando-a-tabela-fipe-via-api/fipe-apresentacao.mp4" autoplay muted controls style="max-width: 100%"></video>

<h3>How the data was acquired</h3>
<p>The first step was <strong>not</strong> to use the existing structure on the FIPE Table website. Python scraping was necessary and the information was downloaded to a MongoDB instance.</p>

<h3>Autocomplete search</h3>
<p>The way search information is presented felt too rigid — I thought it needed something more organic like <strong>autocomplete</strong>. Instead of selecting brand, model, and version step by step, you now only need to search for the desired year separately after selecting the vehicle and its version.</p>
<img src="/api/media/uploads/blog/consultando-a-tabela-fipe-via-api/autocomplete.png" alt="fipe.amb1.io autocomplete" loading="lazy" />

<h3>Price list</h3>
<p>For each vehicle found you can get all values <strong>for 2023</strong> starting in January/2023. The site also shows appreciation/depreciation percentages relative to the previous month and the start of the year.</p>
<img src="/api/media/uploads/blog/consultando-a-tabela-fipe-via-api/precos.png" alt="Price cards on fipe.amb1.io" loading="lazy" />

<h2>But... where's the API?</h2>
<p>The API is available at <a href="https://fipe.amb1.io/api" target="_blank" rel="noopener">fipe.amb1.io/api</a> with endpoints to search brands, models, years, and prices — built on Cloudflare Workers for edge performance.</p>`,
  },
  "como-animar-elementos-sem-usar-javascript-e-css": {
    title: "How to Animate Elements Without JavaScript (or CSS!)",
    description: "Sometimes simple animation needs only SVG.",
    body_html: `<p>Sometimes we need simple animations and end up reaching for heavier solutions like entire JavaScript libraries or overly complex <a href="https://codepen.io/" target="_blank" rel="noopener">CodePen</a> demos when we could use SVG alone.</p>

<p><a href="https://en.wikipedia.org/wiki/SVG" target="_blank" rel="noopener">SVG</a> is a world apart from the web stack. Although the best-known use is icons, it's an excellent platform for everything from <a href="https://lottiefiles.com/animation/svg" target="_blank" rel="noopener">animations</a> to page transitions.</p>

<h2>Inspiration</h2>
<p>I found this tweet showing the <code>animateMotion</code> property — I had never heard of it.</p>
<p><a href="https://twitter.com/PaulieScanlon/status/1624905433306566656" target="_blank" rel="noopener">https://twitter.com/PaulieScanlon/status/1624905433306566656</a></p>

<p>I decided to make my own example and read more about the property on <a href="https://developer.mozilla.org/en-US/docs/Web/SVG/Element/animateMotion" target="_blank" rel="noopener">MDN</a>. Basically <code>animateMotion</code> tells an SVG element to follow the path of another element.</p>

<h2>Trying a different shape</h2>
<p>I wanted a different drawing — like a race on a track — so I found an SVG of the Interlagos circuit in São Paulo and a separate race car SVG. I combined them in Figma, exported a new SVG, and built a group with 3 different cars each with <code>animateMotion</code>, a <code>begin</code> attribute for staggered start, and <code>rotate="auto"</code> so the car turns along the path.</p>

<h2>Improvements</h2>
<p>It's far from perfect — I don't know SVG deeply and just wanted to see the animation work. I'd like the cars 100% inside the track and not leaving the canvas at the edges. If you know how, get in touch!</p>

<h2>Links</h2>
<p>- <a href="https://gist.github.com/rhamses/9645d935ce111274e63ee79b0557adfd" target="_blank" rel="noopener">Final code on my gist</a></p>
<p>- <a href="https://codepen.io/rhamses/full/poOzQBy" target="_blank" rel="noopener">CodePen demo</a></p>
<p>- <a href="https://www.youtube.com/watch?v=4laPOtTRteI" target="_blank" rel="noopener">Sara Drasner is excellent for teaching SVG</a></p>`,
  },
  "identificando-idiomas-através-do-javascript": {
    title: "Identifying Languages Through JavaScript",
    description: "Using native functions that help in everyday work.",
    body_html: `<p>Working with multiple languages is the main path into the Unicode world, but it's not the only one — emojis are only possible thanks to that normalization. Identifying and working with Unicode seems complicated, but at least in JS, it isn't.</p>

<h2>Why Unicode</h2>
<p>Without Unicode even writing HTML would be impossible because it's the basis of any encoding — without it we'd never have the <code>&lt;meta charset="utf-8"&gt;</code> tag that tells the browser how to render special characters.</p>
<p><a href="https://www.youtube.com/watch?v=-n2nlPHEMG8" target="_blank" rel="noopener">https://www.youtube.com/watch?v=-n2nlPHEMG8</a></p>

<h2>Using Unicode in JavaScript</h2>
<p>To use Unicode in JavaScript use the <code>\\u0000</code> pattern where the number is the symbol code in the Unicode standard. You can consult all <a href="https://www.unicode.org/charts/" target="_blank" rel="noopener">supported characters</a>.</p>

<h2>Identifying languages</h2>
<p>All <a href="https://en.wikipedia.org/wiki/Unicode_block" target="_blank" rel="noopener">Unicode symbols are allocated in context blocks</a>, which makes it easy to test languages against each block. Note: blocks are separated by context, not language — you may need to test text against more than one block.</p>

<h2>Practical applications</h2>
<p>One application is assigning a specific font per language, since it's hard to find one free font supporting every world language. On Google Fonts you can search fonts that support specific languages. Below I compared Arabic text with <strong>Roboto</strong> versus the <strong>Almarai</strong> font I chose for Arabic text in the Hashflags Bot project.</p>
<img src="/api/media/uploads/blog/identificando-idiomas-atraves-do-javascript/image2.webp" alt="Roboto Arabic support" loading="lazy" />
<img src="/api/media/uploads/blog/identificando-idiomas-atraves-do-javascript/image1.webp" alt="Almarai Arabic support" loading="lazy" />
<img src="/api/media/uploads/blog/identificando-idiomas-atraves-do-javascript/image.webp" alt="Almarai in Hashflags Bot" loading="lazy" />

<h2>Relevant content</h2>
<p>- <a href="https://flaviocopes.com/javascript-unicode/" target="_blank" rel="noopener">Unicode in JavaScript</a></p>
<p>- <a href="https://home.unicode.org/" target="_blank" rel="noopener">Official Unicode site</a></p>`,
  },
  "criando-imagens-dinamicamente-com-sharp-e-nodejs": {
    title: "Creating Images Dynamically with Sharp and Node.js",
    description: "Generating images dynamically for Node.js",
    body_html: `<p><a href="https://www.npmjs.com/package/sharp" target="_blank" rel="noopener">Sharp</a> is one of the most famous packages in the Node.js ecosystem — the go-to recommendation for image manipulation, conversion, and even editing, listed as a dependency in many large projects. But one thing people rarely talk about is creating a brand-new image from scratch with Sharp — that's what we'll cover.</p>

<figure>
  <img src="/api/media/uploads/blog/criando-imagens-dinamicamente-com-sharp-e-nodejs/image1.png" alt="Image generated with Sharp" loading="lazy" />
  <figcaption>This image was generated with Sharp for the @hashflagsbot project</figcaption>
</figure>

<h2>TL;DR</h2>
<p>To make an image like the one above you'll need multiple calls to the <code>composite</code> method, like Photoshop layers, plus <code>Buffer</code> and SVG packages for text.</p>

<h2>Creating an image</h2>
<p>See the <a href="https://sharp.pixelplumbing.com/api-composite" target="_blank" rel="noopener">official Sharp compositing documentation</a>. To create a new image, instantiate Sharp with parameters inside the <code>create</code> key, then call <code>.png()</code> to indicate we're creating a new PNG image.</p>

<h2>Using composite</h2>
<p>Now that we have a base image, how do we add elements on top? With <code>composite</code> — it merges different images and returns the result so we can continue. Call <code>composite</code> multiple times on the same instance and Sharp does the rest.</p>

<h2>Adding text</h2>
<p>Since Sharp supports jpeg, png, webp, gif, and svg, you can create SVG text and insert it into the base image via code. For the example I use <a href="https://www.npmjs.com/package/text-to-svg" target="_blank" rel="noopener">text-to-svg</a> to vectorize text.</p>

<h2>Rendering the new image</h2>
<p>With the image built entirely in code it's time to export. Sharp offers <code>.toBuffer</code> and <code>.toFile</code> output methods.</p>

<h2>Live demo</h2>
<p><a href="https://codesandbox.io/embed/sharpjs-example-l755gs" target="_blank" rel="noopener">See a demonstration here</a>.</p>
<iframe src="https://codesandbox.io/embed/sharpjs-example-l755gs?fontsize=14&amp;hidenavigation=1&amp;theme=dark" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden; margin-left: auto; margin-right: auto; display:block" title="sharpjs-example" allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking" sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"></iframe>`,
  },
  "hello-world": {
    title: "Hello world! 👋",
    description: "Every blog starts with a post. This is that moment.",
    body_html: `<img src="/api/media/uploads/blog/hello-world.jpeg" alt="Illustration of woman using a meditation app" loading="lazy" />

<h2>New year, old idea</h2>
<p>A year ago I gathered all my courage and decided to post some of my shelved ideas on Twitter, fearing the "code police" would highlight every mistake — but to my surprise I only received praise, with some initiatives even gaining reach like this <a href="https://gerabandeira.netlify.app/" target="_blank" rel="noopener noreferrer">Brazilian flag motto generator</a>.</p>
<p><a href="https://twitter.com/Rhamses/status/1214535685241278464" target="_blank" rel="noopener noreferrer">https://twitter.com/Rhamses/status/1214535685241278464</a></p>
<p>So for this year I decided to dig out one of the most buried projects: this blog.</p>

<h2>Goals 2020...2021?!</h2>
<p>This space was born at the same time as the tweet above, but as usual instead of picking a market tool to ship faster, I <strong>super</strong> complicated the engineering behind it like an Amazon-scale structure only to end up with something much more basic than I imagined.</p>
<p>The main motivation to take this step (and hopefully keep it) was that in 2020 my time programming at the PC dropped a lot while meetings and planning increased considerably — I even got anxious because you need to stay current when talking daily with teams at different knowledge levels.</p>
<p>Reserving an hour a day to write here, I plan to document what I learn about:</p>
<ul>
  <li>Vue.js</li>
  <li>WordPress (and JAMstack integrations with REST and GraphQL APIs)</li>
  <li>MongoDB / Neo4J / ElasticSearch</li>
  <li>Plus many updates on this blog project on <a href="https://github.com/rhamses/blog/" target="_blank" rel="noopener noreferrer">Github</a></li>
  <li>And whatever else comes to mind</li>
</ul>`,
  },
};
