// ==UserScript==
// @name         NYCU E3 UI Plus
// @name:en      NYCU E3 UI Plus
// @name:zh-CN   NYCU E3 介面優化
// @name:zh-TW   NYCU E3 介面最佳化
// @name:zh      NYCU E3 介面最佳化
// @namespace    http://tampermonkey.net/
// @version      1.2.2
// @description  強化 NYCU E3 全站介面與操作體驗。
// @description:en  Improve NYCU E3 full-site UI/UX.
// @description:zh-CN  强化 NYCU E3 全站介面与操作体验。
// @description:zh-TW  強化 NYCU E3 全站介面與操作體驗。
// @description:zh  強化 NYCU E3 全站介面與操作體驗。
// @author       Elvis Mao
// @match        https://e3p.nycu.edu.tw/*
// @icon         https://emtech.cc/static/icons/apple-touch-icon.png
// @license      Apache-2.0
// @homepageURL  https://github.com/Edit-Mr/SSS/tree/main
// @supportURL   https://github.com/Edit-Mr/SSS/issues
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(() => {
	"use strict";

	// 嘗試載入 CSS。如果失敗的話代表可能是使用 dev.js 在跑，交給他就好。
	try {
		GM_addStyle("@import url('https://g.elvismao.com/nycu-em3/index.css');@import url('https://g.elvismao.com/nycu-em3/home.css');");
	} catch (err) {
		console.warn("[TM] Failed to load external CSS, maybe you're in dev mode.");
	}

	const path = location.pathname.replace(/\/+$/, "") || "/";
	const isDashboard = location.origin === "https://e3p.nycu.edu.tw" && (path === "/my" || path === "/my/index.php");
	const isEnglish = new URLSearchParams(location.search).get("lang") === "en" || (document.documentElement.lang || "").startsWith("en");

	function boot() {
		try {
			console.log(`[TM] NYCU E3 UI Plus loaded. Dashboard: ${isDashboard}, English: ${isEnglish}`);
			patchNavbar();
			if (isDashboard) initDashboard();
		} catch (err) {
			console.error("[TM] Error in main execution:", err);
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot, { once: true });
	} else {
		boot();
	}

	// --- tool functions ---

	function patchNavbar() {
		const navbar = document.querySelector("nav.navbar.fixed-top");
		if (!navbar) return;

		// 移除空的 primary-navigation 和 page_heading_menu
		navbar.querySelector(".primary-navigation")?.remove();
		navbar.querySelector("ul.navbar-nav.d-none.d-md-flex")?.remove();
		navbar.querySelector(".navbar-toggler")?.remove();

		document.querySelector("nav .navbar-brand").innerHTML = `
			<img src="https://g.elvismao.com/nycu-em3/e3.svg" alt="E3 Logo" style="height:32px; margin-right:8px;">
			<span style="font-weight:700;">NYCU E3</span>
		`;

		// set favicon
		const favicon = document.querySelector('link[rel="icon"]') || document.createElement("link");
		favicon.rel = "icon";
		favicon.href = "https://g.elvismao.com/nycu-em3/e3.svg";
		document.head.appendChild(favicon);

		// 升級 Gravatar 解析度（頭像 img）
		const avatarImg = navbar.querySelector("#user-menu-toggle img.userpicture");
		if (avatarImg?.src) {
			avatarImg.src = avatarImg.src.replace("s=35", "s=200");
			avatarImg.removeAttribute("width");
			avatarImg.removeAttribute("height");
		}
	}

	function initDashboard() {
		const data = extractDashboardData();
		const app = buildDashboardApp(data);

		document.getElementById("page")?.remove();
		document.getElementById("page-wrapper").appendChild(app);
	}

	function extractDashboardData() {
		const siteLogo = document.querySelector(".navbar-brand img")?.src || document.querySelector(".drawerheader a img")?.src || "";

		const avatarRaw = document.querySelector("#user-menu-toggle img")?.src || document.querySelector(".myprofileitem.picture img")?.src || "";
		// Gravatar 預設 s=35 畫質很差，換成 200
		const avatar = avatarRaw.replace("s=35", "s=200");

		const notificationCount = cleanText(document.querySelector("#nav-notification-popover-container .count-container")?.textContent) || "";

		const lang = cleanText([...document.querySelectorAll("#usernavigation a.nav-link")].map(el => el.textContent).find(t => /\bTW\b/i.test(t))) || "TW";

		const profileName = cleanText(document.querySelector("#inst82730 .myprofileitem.fullname")?.textContent) || "已登入使用者";

		const country = cleanText(document.querySelector("#inst82730 .myprofileitem.country")?.textContent).replace(/^國家:\s*/, "");

		const englishName = cleanText(document.querySelectorAll("#inst82730 .myprofileitem.city")[0]?.textContent).replace(/^英文姓名:\s*/, "");

		const email = cleanText(document.querySelectorAll("#inst82730 .myprofileitem.city")[1]?.textContent).replace(/^電子郵件信箱:\s*/, "");

		const courses = parseCourses();
		const announcements = parseAnnouncements();
		const events = parseEvents();

		// Collect unique terms in DOM order (newest first); courses without a term go under "其他"
		const allTerms = [...new Set(courses.map(c => c.term).filter(Boolean))];
		if (courses.some(c => !c.term)) allTerms.push("其他");
		const currentTerm = allTerms[0] || "";

		return {
			siteLogo,
			avatar,
			notificationCount,
			lang,
			isEnglish,
			profileName,
			country,
			englishName,
			email,
			currentTerm,
			allTerms,
			courses,
			announcements,
			events
		};
	}

	function parseCourses() {
		// 優先抓右側主課程清單；若只有一個學期，再補入左側 sidebar（可能包含舊學期）
		const rightNodes = [...document.querySelectorAll("#layer2_right_current_course_stu a.course-link")];
		const leftNodes = [...document.querySelectorAll("#layer2_right_current_course_left a.course-link")];

		// 右側已有的 href set，用來去重
		const rightHrefs = new Set(rightNodes.map(a => normalizeHref(a.getAttribute("href"))).filter(Boolean));

		// 把左側有、但右側沒有的補進來（舊學期課程）
		const extraNodes = leftNodes.filter(a => !rightHrefs.has(normalizeHref(a.getAttribute("href"))));

		const nodes = [...rightNodes, ...extraNodes];
		const seen = new Set();
		const items = [];

		for (const a of nodes) {
			const href = normalizeHref(a.getAttribute("href"));
			const raw = cleanText(a.textContent);
			if (!href || !raw || seen.has(href)) continue;
			seen.add(href);

			const termMatch = raw.match(/【([^】]+)】/);
			const term = termMatch ? termMatch[1] : "";

			// 去掉【學期】前綴與課號後，剩下「中文名稱 英文名稱」
			const body = raw
				.replace(/^\s*【[^】]+】\s*/, "")
				.replace(/^\d+\s*/, "")
				.trim();

			// 英文部分：從第一個「空白+大寫英文字母」開始到結尾
			const enMatch = body.match(/\s+([A-Z].*)$/);
			const titleEn = enMatch ? enMatch[1].trim() : "";
			const titleZh = enMatch ? body.slice(0, enMatch.index).trim() : body;

			const title = titleZh || raw;

			items.push({ title, titleZh: title, titleEn, href, term });
		}

		return items;
	}

	function parseAnnouncements() {
		const posts = [...document.querySelectorAll("#inst20 .post")];
		return posts.map(post => {
			const dateLine = cleanText(post.querySelector(".date")?.textContent);
			const courseRaw = cleanText(post.querySelector(".date b")?.textContent);
			const title = cleanText(post.querySelector(".name")?.textContent);
			const info = cleanText(post.querySelector(".info")?.textContent);
			const link = normalizeHref(post.querySelector(".info a")?.getAttribute("href"));

			const time = dateLine.replace(courseRaw, "").trim();

			// 格式：1142.515501.離散數學 Discrete Mathematics → 離散數學
			// 先去掉「學期代碼.課號.」前綴，再去掉英文名稱
			const course =
				courseRaw
					.replace(/^\d+\.\d+\./, "") // 去掉 "1142.515501."
					.replace(/\s+[A-Za-z][\s\S]*$/, "") // 去掉英文名稱
					.trim() || courseRaw;

			return {
				course,
				time,
				title,
				info,
				href: link || "#"
			};
		});
	}

	function parseEvents() {
		const items = [...document.querySelectorAll('#inst11984 [data-region="event-item"]')];
		return items.slice(0, 4).map(item => {
			const title = cleanText(item.querySelector("h6 a")?.textContent);
			const href = normalizeHref(item.querySelector("h6 a")?.getAttribute("href"));
			const time = cleanText(item.querySelector(".date")?.textContent);
			return { title, href, time };
		});
	}

	function buildDashboardApp(data) {
		const app = document.createElement("div");
		app.className = "e3rp-app";

		app.innerHTML = `
      <main class="e3rp-main">
        <div class="e3rp-col">
          <section class="e3rp-section">
            <div class="e3rp-section-head">
              <h2 class="e3rp-section-title">課程列表</h2>
              ${
								data.allTerms.length > 1
									? `<div class="e3rp-term-dropdown" id="e3rp-term-dropdown">
                      <button class="e3rp-pill e3rp-pill-btn" id="e3rp-term-btn" aria-haspopup="true" aria-expanded="false">
                        ${escapeHTML(data.currentTerm)} <span class="e3rp-pill-caret">▾</span>
                      </button>
                      <ul class="e3rp-term-menu" id="e3rp-term-menu" role="listbox">
                        ${data.allTerms
													.map(t => {
														const val = t === "其他" ? "" : t;
														return `<li class="e3rp-term-option${t === data.currentTerm ? " active" : ""}" role="option" data-term="${escapeAttr(val)}">${escapeHTML(t)}</li>`;
													})
													.join("")}
                      </ul>
                    </div>`
									: data.currentTerm
										? `<div class="e3rp-pill">${escapeHTML(data.currentTerm)}</div>`
										: ""
							}
            </div>
            ${
							data.courses.length
								? `<div class="e3rp-course-grid" id="e3rp-course-grid">
                    ${data.courses
											.map(
												course => `
                          <a class="e3rp-course-chip" href="${escapeAttr(course.href)}" data-term="${escapeAttr(course.term)}"${course.term !== data.currentTerm ? ' style="display:none"' : ""}>
                            ${escapeHTML(data.isEnglish && course.titleEn ? course.titleEn : course.titleZh)}
                          </a>
                        `
											)
											.join("")}
                  </div>`
								: `<div class="e3rp-empty">沒有抓到課程資料</div>`
						}
          </section>

          <section class="e3rp-section">
            <div class="e3rp-section-head">
              <h2 class="e3rp-section-title">已登入使用者</h2>
            </div>
            <div class="e3rp-card e3rp-profile-card">
              <div class="e3rp-profile-pic">
                ${data.avatar ? `<img src="${escapeAttr(data.avatar)}" alt="profile">` : ""}
              </div>
              <div>
                <div class="e3rp-profile-name">${escapeHTML(data.profileName)}</div>
                ${data.country ? `<div class="e3rp-profile-line"><b>國家:</b> ${escapeHTML(data.country)}</div>` : ""}
                ${data.englishName ? `<div class="e3rp-profile-line"><b>英文姓名:</b> ${escapeHTML(data.englishName)}</div>` : ""}
                ${data.email ? `<div class="e3rp-profile-line"><b>電子郵件信箱:</b> ${escapeHTML(data.email)}</div>` : ""}
              </div>
            </div>
          </section>
        </div>

        <div class="e3rp-col">
          <section class="e3rp-section">
            <div class="e3rp-section-head">
              <h2 class="e3rp-section-title">課程公告</h2>
            </div>
            <div class="e3rp-card e3rp-announcements">
              ${
								data.announcements.length
									? data.announcements
											.map(
												item => `
                          <a class="e3rp-announcement" href="${escapeAttr(item.href)}">
                            <div class="e3rp-announcement-meta">
                              <span class="e3rp-announcement-course">${escapeHTML(item.course)}</span>
                              ${item.time ? ` / ${escapeHTML(item.time)}` : ""}
                            </div>
                            <div class="e3rp-announcement-title">${escapeHTML(item.title)}</div>
                            <div class="e3rp-announcement-desc">${escapeHTML(item.info)}</div>
                          </a>
                        `
											)
											.join("")
									: `<div class="e3rp-empty">沒有抓到公告資料</div>`
							}
            </div>
          </section>

          <section class="e3rp-section">
            <div class="e3rp-section-head">
              <h2 class="e3rp-section-title">未來事件</h2>
            </div>
            <div class="e3rp-card e3rp-events">
              ${
								data.events.length
									? data.events
											.map(
												event => `
                          <a class="e3rp-event" href="${escapeAttr(event.href)}">
                            <div class="e3rp-event-icon">🎓</div>
                            <div>
                              <div class="e3rp-event-title">${escapeHTML(event.title)}</div>
                              <div class="e3rp-event-time">${escapeHTML(event.time)}</div>
                            </div>
                          </a>
                        `
											)
											.join("")
									: `<div class="e3rp-empty">沒有抓到未來事件</div>`
							}
            </div>
          </section>
        </div>
      </main>
    `;

		// Term dropdown interaction
		const termBtn = app.querySelector("#e3rp-term-btn");
		const termMenu = app.querySelector("#e3rp-term-menu");
		const courseGrid = app.querySelector("#e3rp-course-grid");
		if (termBtn && termMenu && courseGrid) {
			let activeTerm = data.currentTerm;

			const applyTerm = term => {
				activeTerm = term;

				// Update pill label
				const label = term === "" ? "其他" : term;
				termBtn.childNodes[0].textContent = label + " ";

				// Show/hide chips
				courseGrid.querySelectorAll(".e3rp-course-chip").forEach(chip => {
					const t = chip.dataset.term;
					chip.style.display = t === term ? "" : "none";
				});

				// Update active state in menu
				termMenu.querySelectorAll(".e3rp-term-option").forEach(opt => {
					opt.classList.toggle("active", opt.dataset.term === term);
				});
			};

			termBtn.addEventListener("click", e => {
				e.stopPropagation();
				const open = termMenu.classList.toggle("open");
				termBtn.setAttribute("aria-expanded", String(open));
			});

			termMenu.addEventListener("click", e => {
				const option = e.target.closest(".e3rp-term-option");
				if (!option) return;
				applyTerm(option.dataset.term);
				termMenu.classList.remove("open");
				termBtn.setAttribute("aria-expanded", "false");
			});

			// Close on outside click
			document.addEventListener("click", () => {
				termMenu.classList.remove("open");
				termBtn.setAttribute("aria-expanded", "false");
			});
		}

		return app;
	}

	function normalizeHref(href) {
		if (!href) return "";
		try {
			return new URL(href, location.origin).href;
		} catch {
			return href;
		}
	}

	function cleanText(value) {
		return (value || "")
			.replace(/\u00a0/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	function escapeHTML(str) {
		return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
	}

	function escapeAttr(str) {
		return escapeHTML(str);
	}
})();
