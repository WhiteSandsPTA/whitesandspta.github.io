/* ============================================================
   White Sands School PTA — Interactions
   ============================================================ */
(function () {
  "use strict";

  var header = document.getElementById("siteHeader");
  var navToggle = document.getElementById("navToggle");
  var navMenu = document.getElementById("navMenu");

  /* --- Announcement notice: reveal it only while the meeting is upcoming ---
     The date lives in the <time datetime="..."> inside the bar, so the text
     people read and the date we check can never drift apart. The datetime
     carries a Mountain Time offset, so the notice hides at 3:00 PM our time
     no matter where the visitor is. If it is missing or unreadable we show
     the notice anyway — a typo should not silently swallow an announcement. */
  var noticeBar = document.getElementById("noticeBar");
  var meetingEl = noticeBar && noticeBar.querySelector("time[datetime]");
  var meetingAt = meetingEl ? new Date(meetingEl.getAttribute("datetime")) : null;
  var meetingIsReadable = !!meetingAt && !isNaN(meetingAt.getTime());

  if (noticeBar && (!meetingIsReadable || meetingAt > new Date())) {
    noticeBar.classList.add("is-upcoming");
  }

  /* --- "Add to calendar" --------------------------------------------------
     Every calendar gets its details from the same notice-bar attributes, so
     the banner and the calendar entry can never disagree. Google and Outlook
     take a URL; Apple and everything else take a downloaded .ics file, which
     is the format they all agree on. Times are converted to UTC so no
     timezone definition has to travel with the event. */
  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  // 20260821T210000Z — the stamp format shared by .ics and Google
  function utcStamp(date) {
    return (
      date.getUTCFullYear() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      "T" +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      "Z"
    );
  }

  function icsEscape(text) {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  // RFC 5545 caps lines at 75 octets; continuations start with a space.
  function icsFold(line) {
    if (line.length <= 75) return line;
    var folded = line.slice(0, 75);
    var rest = line.slice(75);
    while (rest.length > 74) {
      folded += "\r\n " + rest.slice(0, 74);
      rest = rest.slice(74);
    }
    return folded + "\r\n " + rest;
  }

  function buildIcs(ev) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//White Sands School PTA//Website//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      // Matches the UID in assets/pta-meeting.ics, so a parent who uses both
      // routes updates one event instead of collecting duplicates.
      "UID:" + utcStamp(ev.start) + "-pta@whitesands-pta",
      "DTSTAMP:" + utcStamp(new Date()),
      "DTSTART:" + utcStamp(ev.start),
      "DTEND:" + utcStamp(ev.end),
      "SUMMARY:" + icsEscape(ev.title),
      "LOCATION:" + icsEscape(ev.location),
      "DESCRIPTION:" + icsEscape(ev.description),
      "URL:" + ev.url,
      "END:VEVENT",
      "END:VCALENDAR"
    ]
      .map(icsFold)
      .join("\r\n") + "\r\n";
  }

  function downloadIcs(ev) {
    var blob = new Blob([buildIcs(ev)], { type: "text/calendar;charset=utf-8" });
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = "white-sands-pta-meeting.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  function googleUrl(ev) {
    return (
      "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(ev.title) +
      "&dates=" + utcStamp(ev.start) + "/" + utcStamp(ev.end) +
      "&details=" + encodeURIComponent(ev.description) +
      "&location=" + encodeURIComponent(ev.location)
    );
  }

  function outlookUrl(ev) {
    return (
      "https://outlook.live.com/calendar/0/deeplink/compose" +
      "?path=/calendar/action/compose&rru=addevent" +
      "&subject=" + encodeURIComponent(ev.title) +
      "&startdt=" + encodeURIComponent(ev.start.toISOString()) +
      "&enddt=" + encodeURIComponent(ev.end.toISOString()) +
      "&body=" + encodeURIComponent(ev.description) +
      "&location=" + encodeURIComponent(ev.location)
    );
  }

  var calToggle = document.getElementById("calToggle");
  var calMenu = document.getElementById("calMenu");

  if (noticeBar && calToggle && calMenu && meetingIsReadable) {
    var endsAt = new Date(noticeBar.getAttribute("data-event-end"));
    if (isNaN(endsAt.getTime())) {
      // No usable end time — assume the meeting runs an hour.
      endsAt = new Date(meetingAt.getTime() + 60 * 60 * 1000);
    }

    var meeting = {
      title: noticeBar.getAttribute("data-event-title") || "White Sands School PTA Meeting",
      location: noticeBar.getAttribute("data-event-location") || "",
      description: noticeBar.getAttribute("data-event-description") || "",
      url: window.location.href.split("#")[0],
      start: meetingAt,
      end: endsAt
    };

    calMenu.querySelector('[data-cal="google"]').href = googleUrl(meeting);
    calMenu.querySelector('[data-cal="outlook"]').href = outlookUrl(meeting);

    /* The Apple / download options point at the committed
       assets/pta-meeting.ics, because iOS Safari only hands the event
       straight to Calendar when it comes from a real text/calendar URL — a
       generated Blob just lands in Files. The cost is that the date now lives
       in two places, so confirm the file still agrees with the banner. If it
       has drifted, or cannot be read at all, quietly switch back to building
       the event in the browser, which is always correct. */
    var buildInBrowser = false;
    var staticIcs = calMenu.querySelector('[data-cal="apple"]');

    if (staticIcs && window.fetch) {
      window
        .fetch(staticIcs.getAttribute("href"))
        .then(function (res) {
          return res.ok ? res.text() : Promise.reject(new Error("missing"));
        })
        .then(function (text) {
          var fileStart = (text.match(/DTSTART:(\S+)/) || [])[1];
          var fileEnd = (text.match(/DTEND:(\S+)/) || [])[1];
          if (
            fileStart !== utcStamp(meeting.start) ||
            fileEnd !== utcStamp(meeting.end)
          ) {
            buildInBrowser = true;
          }
        })
        .catch(function () {
          buildInBrowser = true;
        });
    } else {
      buildInBrowser = true;
    }

    var closeCal = function () {
      calMenu.hidden = true;
      calToggle.setAttribute("aria-expanded", "false");
    };

    calToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (calMenu.hidden) {
        calMenu.hidden = false;
        calToggle.setAttribute("aria-expanded", "true");
      } else {
        closeCal();
      }
    });

    calMenu.addEventListener("click", function (e) {
      var choice = e.target.closest("a[data-cal]");
      if (!choice) return;
      var kind = choice.getAttribute("data-cal");
      if (buildInBrowser && (kind === "apple" || kind === "ics")) {
        e.preventDefault();
        downloadIcs(meeting);
      }
      closeCal();
    });

    document.addEventListener("click", function (e) {
      if (!calMenu.hidden && !calMenu.contains(e.target)) closeCal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeCal();
    });
  } else if (calToggle) {
    // Without a readable date we cannot build an event; drop the button
    // rather than offer one that would add a broken entry.
    calToggle.parentNode.remove();
  }

  /* --- Sticky header shadow on scroll --- */
  function onScroll() {
    if (window.scrollY > 12) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --- Mobile nav toggle --- */
  function closeMenu() {
    navMenu.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open menu");
  }
  function openMenu() {
    navMenu.classList.add("open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Close menu");
  }

  navToggle.addEventListener("click", function () {
    if (navMenu.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Close the mobile menu after tapping a link
  navMenu.addEventListener("click", function (e) {
    if (e.target.tagName === "A") closeMenu();
  });

  // Close on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  /* --- Scroll reveal --- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    reveals.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("in");
    });
  }

  /* --- Current year in footer --- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
