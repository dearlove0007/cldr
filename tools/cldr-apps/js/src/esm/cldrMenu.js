/*
 * cldrMenu: encapsulate functions for Survey Tool menus, especially the left sidebar
 * for choosing locales, reports, specials, data sections; also for the Coverage menu
 * in the top navigation bar, and other kinds of "menu" -- TODO: separation of concerns!
 */
import * as cldrAjax from "./cldrAjax.js";
import * as cldrCoverage from "./cldrCoverage.js";
import * as cldrDom from "./cldrDom.js";
import * as cldrEvent from "./cldrEvent.js";
import * as cldrGui from "./cldrGui.js";
import * as cldrLoad from "./cldrLoad.js";
import { LocaleMap } from "./cldrLocaleMap.js";
import * as cldrStatus from "./cldrStatus.js";
import * as cldrSurvey from "./cldrSurvey.js";
import * as cldrText from "./cldrText.js";

/**
 * "_thePages": menu data -- mostly (or exclusively?) for the left sidebar
 *
 * a.k.a. "menuMap" or "menus"; TODO: name consistently
 */
let _thePages = null;

function getThePages() {
  return _thePages;
}

const coverageMenu = [];

/**
 * List of buttons/titles to set. This is not for the left sidebar; it's for
 * headers such as "-/Locale Display Names/Languages (A-D)" in the main window.
 */
const menubuttons = {
  locale: "title-locale", // cf. id='title-locale-container'
  section: "title-section", // cf. id='title-section-container'
  page: "title-page", // cf. id='title-page-container'
  dcontent: "title-dcontent", // cf. id='title-dcontent-container'

  /**
   * Set the innerHTML of an element, and display or hide it
   * Called as menubuttons.set(id, html) to show or menubuttons.set(id) to hide
   *
   * @param {string} id - one of the id strings above (title-locale/section/page/dcontent)
   * @param {string} html - text (html) to show, or undefined to hide
   */
  set: function (id, html) {
    let cnode = document.getElementById(id + "-container");
    if (!cnode) {
      // for Elements that do their own stunts -- in fact there are none currently (2021-01-04)
      cnode = document.getElementById(id);
    }
    if (html && html !== "-") {
      // Here "updateIf" seems to have no effect; if the element with id exists, it already has html for innerHTML.
      // Commenting it out seems to make no difference. But I haven't confirmed yet that's ALWAYS true.
      cldrDom.updateIf(id, html);
      cldrDom.setDisplayed(cnode, true);
    } else {
      cldrDom.setDisplayed(cnode, false);
      cldrDom.updateIf(id, "-");
    }
  },
};

function getInitialMenusEtc(sessionId) {
  const theLocale = cldrStatus.getCurrentLocale() || "root";
  const xurl = getMenusAjaxUrl(theLocale, true /* get locmap */);
  cldrLoad.myLoad(xurl, "initial menus for " + theLocale, function (json) {
    loadInitialMenusFromJson(json);
  });
}

function loadInitialMenusFromJson(json) {
  if (!cldrLoad.verifyJson(json, "locmap")) {
    return;
  }
  const locmap = new LocaleMap(json.locmap);
  cldrLoad.setTheLocaleMap(locmap);

  if (cldrStatus.getCurrentLocale() === "USER" && json.loc) {
    cldrStatus.setCurrentLocale(json.loc);
  }
  setupCanModify(json); // json.canmodify

  // update left sidebar with locale data
  const theDiv = document.createElement("div");
  theDiv.className = "localeList";

  // TODO: avoid duplication of some of this code here and in cldrLocales.js
  addTopLocale("root", theDiv);
  for (let n in locmap.locmap.topLocales) {
    const topLoc = locmap.locmap.topLocales[n];
    addTopLocale(topLoc, theDiv);
  }
  $("#locale-list").html(theDiv.innerHTML);

  if (cldrStatus.isVisitor()) {
    $("#show-read").prop("checked", true);
  }

  $("a.locName").tooltip();

  cldrEvent.filterAllLocale();

  setupCoverageLevels(json);

  cldrLoad.continueInitializing(json.canAutoImport || false);
}

function setupCoverageLevels(json) {
  cldrCoverage.updateCovFromJson(json);

  const surveyLevels = json.menus.levels;
  cldrCoverage.setSurveyLevels(surveyLevels);

  let levelNums = []; // numeric levels
  for (let k in surveyLevels) {
    levelNums.push({
      num: parseInt(surveyLevels[k].level),
      level: surveyLevels[k],
    });
  }
  levelNums.sort(function (a, b) {
    return a.num - b.num;
  });
  const orgCov = cldrCoverage.getSurveyOrgCov();
  const defaultLabel = cldrText.sub("coverage_auto_msg", {
    surveyOrgCov: cldrText.get("coverage_" + orgCov),
  });
  coverageMenu.length = 0;
  coverageMenu.push({
    label: "Auto",
    value: "auto",
  });
  for (let j in levelNums) {
    // use given order
    if (levelNums[j].num == 0) {
      continue; // none - skip
    }
    if (levelNums[j].num < cldrCoverage.covValue("minimal")) {
      continue; // don't bother showing these
    }
    if (cldrStatus.getIsUnofficial() === false && levelNums[j].num == 101) {
      continue; // hide Optional in production
    }
    const level = levelNums[j].level;
    const label =
      level.name === orgCov
        ? defaultLabel
        : cldrText.get("coverage_" + level.name);
    coverageMenu.push({
      label: label,
      value: level.name,
    });
  }
}

function setCoverageLevel(newValue) {
  const setUserCovTo = newValue == "auto" ? null : newValue;
  if (setUserCovTo !== cldrCoverage.getSurveyUserCov()) {
    const theLocale = cldrStatus.getCurrentLocale() || "root";
    cldrCoverage.setSurveyUserCov(setUserCovTo);
    const updurl = getUpdatePreferencesAjaxUrl(theLocale);
    cldrLoad.myLoad(
      updurl,
      "updating covlev to  " + cldrCoverage.getSurveyUserCov(),
      function (json) {
        if (cldrLoad.verifyJson(json, "pref")) {
          cldrEvent.unpackMenuSideBar(json);
          cldrLoad.handleCoverageChanged(cldrCoverage.getSurveyUserCov());
          console.log("Server set covlev successfully.");
        }
      }
    );
  }
  // still update these.
  cldrLoad.coverageUpdate();
  cldrLoad.updateHashAndMenus(false);
  return false;
}

function addTopLocale(topLoc, theDiv) {
  const locmap = cldrLoad.getTheLocaleMap();
  const topLocInfo = locmap.getLocaleInfo(topLoc);

  const topLocRow = document.createElement("div");
  topLocRow.className = "topLocaleRow";

  const topLocDiv = document.createElement("div");
  topLocDiv.className = "topLocale";
  cldrLoad.appendLocaleLink(topLocDiv, topLoc, topLocInfo);

  const topLocList = document.createElement("div");
  topLocList.className = "subLocaleList";

  addSubLocales(topLocList, topLocInfo);

  topLocRow.appendChild(topLocDiv);
  topLocRow.appendChild(topLocList);
  theDiv.appendChild(topLocRow);
}

function addSubLocales(parLocDiv, subLocInfo) {
  if (subLocInfo.sub) {
    for (let n in subLocInfo.sub) {
      const subLoc = subLocInfo.sub[n];
      addSubLocale(parLocDiv, subLoc);
    }
  }
}

function addSubLocale(parLocDiv, subLoc) {
  const locmap = cldrLoad.getTheLocaleMap();
  const subLocInfo = locmap.getLocaleInfo(subLoc);
  const subLocDiv = cldrDom.createChunk(null, "div", "subLocale");
  cldrLoad.appendLocaleLink(subLocDiv, subLoc, subLocInfo);
  parLocDiv.appendChild(subLocDiv);
}

function unpackMenus(json) {
  if (_thePages) {
    unpackSections(json);
  } else {
    initializeThePages(json);
  }
  setSectionMinimumLevels(_thePages.sectionMap, json);
  _thePages.haveLocs[json.loc] = true;
}

function initializeThePages(json) {
  // Make a deep copy of json rather than directly modifying the json we got from the server.
  // Treat json as read-only, for modularity, separation of concerns.
  // Formerly we had menus = json.menus, then effectively modified json itself -- for example,
  // creating json.menus.sectionMap, which could be problematic, for example, if we ever
  // cache json as part of a better client-side data model. Maybe also problematic for
  // garbage collection, and for unit-testing where we wouldn't want json to be modified.
  const menus = JSON.parse(JSON.stringify(json.menus));
  menus.haveLocs = {};
  menus.sectionMap = {};
  menus.pageToSection = {};
  for (let k in menus.sections) {
    menus.sectionMap[menus.sections[k].id] = menus.sections[k];
    menus.sections[k].pageMap = {};
    menus.sections[k].minLev = {};
    for (let j in menus.sections[k].pages) {
      menus.sections[k].pageMap[menus.sections[k].pages[j].id] =
        menus.sections[k].pages[j];
      menus.pageToSection[menus.sections[k].pages[j].id] = menus.sections[k];
    }
  }
  _thePages = menus;
}

function unpackSections(json) {
  const menus = json.menus;
  for (let k in menus.sections) {
    const oldSection = _thePages.sectionMap[menus.sections[k].id];
    for (let j in menus.sections[k].pages) {
      const oldPage = oldSection.pageMap[menus.sections[k].pages[j].id];

      // copy over levels
      oldPage.levs[json.loc] = menus.sections[k].pages[j].levs[json.loc];
    }
  }
}

function setSectionMinimumLevels(sectionMap, json) {
  for (let k in sectionMap) {
    let min = 200;
    for (let j in sectionMap[k].pageMap) {
      const thisLev = parseInt(sectionMap[k].pageMap[j].levs[json.loc]);
      if (min > thisLev) {
        min = thisLev;
      }
    }
    sectionMap[k].minLev[json.loc] = min;
  }
}

function update() {
  updateLocaleMenu();

  const curLocale = cldrStatus.getCurrentLocale();
  if (curLocale == null) {
    /* Do this for null, but not for empty string ""; it's originally null, later may be "".
         Note that ("" == null) is false. */
    menubuttons.set(menubuttons.section);
    const curSpecial = cldrStatus.getCurrentSpecial();
    if (curSpecial != null) {
      const specialId = "special_" + curSpecial;
      menubuttons.set(menubuttons.page, cldrText.get(specialId));
    } else {
      menubuttons.set(menubuttons.page);
    }
  } else {
    if (_thePages == null || _thePages.loc != curLocale) {
      getMenusFromServer();
    } else {
      // go ahead and update
      updateMenus(_thePages);
    }
  }
}

function getMenusFromServer(s) {
  // show the raw IDs while loading.
  // TODO: clarify whether it's necessary -- the code would be cleaner without null here
  updateMenuTitles(null);
  const curLocale = cldrStatus.getCurrentLocale();
  if (!curLocale) {
    return;
  }
  const url = getMenusAjaxUrl(curLocale, false /* do not get locmap */);
  cldrLoad.myLoad(url, "menus", function (json) {
    if (!cldrLoad.verifyJson(json, "menus")) {
      console.log("JSON verification failed for menus in cldrLoad");
      return; // busted?
    }
    // Note: since the url has "locmap=false", we never get json.locmap or json.canmodify here
    cldrCoverage.updateCovFromJson(json);
    cldrLoad.coverageUpdate();
    unpackMenus(json);
    cldrEvent.unpackMenuSideBar(json);
    updateMenus(_thePages);
    cldrGui.updateWithStatus();
  });
}

// TODO: always called with menuMap = _thePages so don't pass as parameter;
// "menuMap" ALMOST always a synonym for _thePages in this file? Name it consistently...
// CAUTION: exception, updateMenuTitles can be called with null instead of menuMap
function updateMenus(menuMap) {
  updateMenuTitles(menuMap);

  let myPage = null;
  let mySection = null;
  const curSpecial = cldrStatus.getCurrentSpecial();
  if (!curSpecial) {
    // first, update display names
    const curPage = cldrStatus.getCurrentPage();
    if (menuMap.sectionMap[curPage]) {
      // page is really a section
      mySection = menuMap.sectionMap[curPage];
      myPage = null;
    } else if (menuMap.pageToSection[curPage]) {
      mySection = menuMap.pageToSection[curPage];
      myPage = mySection.pageMap[curPage];
    }
    if (mySection) {
      const titlePageContainer = document.getElementById(
        "title-page-container"
      );

      // update menus under 'page' - peer pages
      if (!titlePageContainer.menus) {
        titlePageContainer.menus = {};
      }

      const showMenu = titlePageContainer.menus[mySection.id];

      if (!showMenu) {
        titlePageContainer.menus[mySection.id] = mySection.pagesMenu = null;
      }

      if (myPage !== null) {
        $("#title-page-container")
          .html("<h1>" + myPage.name + "</h1>")
          .show();
      } else {
        $("#title-page-container").html("").hide();
      }
      cldrDom.setDisplayed(titlePageContainer, true); // will fix title later
    }
  }
  cldrEvent.resizeSidebar();
}

function updateMenuTitles(menuMap) {
  updateLocaleMenu();
  updateTitleAndSection(menuMap);
}

function updateLocaleMenu() {
  const curLocale = cldrStatus.getCurrentLocale();
  if (curLocale != null && curLocale != "" && curLocale != "-") {
    const locmap = cldrLoad.getTheLocaleMap();
    cldrStatus.setCurrentLocaleName(locmap.getLocaleName(curLocale));
    var bund = locmap.getLocaleInfo(curLocale);
    if (bund) {
      if (bund.readonly) {
        cldrDom.addClass(document.getElementById(menubuttons.locale), "locked");
      } else {
        cldrDom.removeClass(
          document.getElementById(menubuttons.locale),
          "locked"
        );
      }

      if (bund.dcChild) {
        menubuttons.set(
          menubuttons.dcontent,
          cldrText.sub("defaultContent_header_msg", {
            info: bund,
            locale: cldrStatus.getCurrentLocale(),
            dcChild: locmap.getLocaleName(bund.dcChild),
          })
        );
      } else {
        menubuttons.set(menubuttons.dcontent);
      }
    } else {
      cldrDom.removeClass(
        document.getElementById(menubuttons.locale),
        "locked"
      );
      menubuttons.set(menubuttons.dcontent);
    }
  } else {
    cldrStatus.setCurrentLocaleName("");
    cldrDom.removeClass(document.getElementById(menubuttons.locale), "locked");
    menubuttons.set(menubuttons.dcontent);
  }
  menubuttons.set(menubuttons.locale, cldrStatus.getCurrentLocaleName());
}

/**
 * Update the header such as "-/Locale Display Names/Languages (A-D)" (Title and Section),
 * or "-/Datetime" (Report), or "-/Forum Posts", etc.
 * Note that the hyphen in "-/..." is clickable. But there is no hyphen in "/About Survey Tool".
 *
 * @param {*} menuMap
 */
function updateTitleAndSection(menuMap) {
  const curSpecial = cldrStatus.getCurrentSpecial();
  const titlePageContainer = document.getElementById("title-page-container");

  if (curSpecial != null && curSpecial != "") {
    const specialId = "special_" + curSpecial;
    $("#section-current").html(cldrText.get(specialId));
    cldrDom.setDisplayed(titlePageContainer, false);
  } else if (!menuMap) {
    cldrDom.setDisplayed(titlePageContainer, false);
  } else {
    const curPage = cldrStatus.getCurrentPage();
    if (menuMap.sectionMap[curPage]) {
      const curSection = curPage; // section = page
      cldrStatus.setCurrentSection(curSection);
      $("#section-current").html(menuMap.sectionMap[curSection].name);
      cldrDom.setDisplayed(titlePageContainer, false); // will fix title later
    } else if (menuMap.pageToSection[curPage]) {
      const mySection = menuMap.pageToSection[curPage];
      cldrStatus.setCurrentSection(mySection.id);
      $("#section-current").html(mySection.name);
      cldrDom.setDisplayed(titlePageContainer, false); // will fix title later
    } else {
      $("#section-current").html(cldrText.get("section_general"));
      cldrDom.setDisplayed(titlePageContainer, false);
    }
  }
}

/**
 * TODO: document and encapsulate "canmodify"
 */
let canmodify = {};

function setupCanModify(json) {
  if (json.canmodify) {
    for (let k in json.canmodify) {
      canmodify[json.canmodify[k]] = true;
    }
  }
}

function canModifyLoc(subLoc) {
  if (canmodify && subLoc in canmodify) {
    return true;
  } else {
    return false;
  }
}

function getCoverageMenu() {
  return coverageMenu;
}

function getMenusAjaxUrl(locale, getLocmap) {
  const p = new URLSearchParams();
  p.append("what", "menus"); // cf. WHAT_GET_MENUS in SurveyAjax.java
  p.append("_", locale);
  p.append("locmap", !!getLocmap);
  p.append("s", cldrStatus.getSessionId());
  p.append("cacheKill", cldrSurvey.cacheBuster());
  return cldrAjax.makeUrl(p);
}

function getUpdatePreferencesAjaxUrl(locale) {
  const p = new URLSearchParams();
  p.append("what", "pref"); // cf. WHAT_PREF in SurveyAjax.java
  p.append("_", locale);
  p.append("pref", "p_covlev"); // cf. SurveyMain.PREF_COVLEV in SurveyMain.java
  p.append("_v", cldrCoverage.getSurveyUserCov());
  p.append("s", cldrStatus.getSessionId());
  p.append("cacheKill", cldrSurvey.cacheBuster());
  return cldrAjax.makeUrl(p);
}

export {
  addTopLocale,
  canModifyLoc,
  getCoverageMenu,
  getInitialMenusEtc,
  getThePages,
  setCoverageLevel,
  update,
};
