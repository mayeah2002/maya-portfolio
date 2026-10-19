// מקטין או מגדיל את הבמה (1440×1024 כמו בפיגמה) כך שתיכנס במלואה לכל מסך
const stage = document.querySelector('.stage');
const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 1024;

function fitStageToScreen() {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  stage.style.setProperty('--stage-scale', scale);
}

fitStageToScreen();
window.addEventListener('resize', fitStageToScreen);
