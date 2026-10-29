// מקטין או מגדיל את הבמה (1440×1024 כמו בפיגמה) כך שתיכנס במלואה לכל מסך
const stage = document.querySelector('.stage');
const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 1024;
const PROCESS_PAGE_HEIGHT = 2710;
const fishInteractiveGroup = document.querySelector('.fish-interactive-group');
const longPageShell = document.querySelector('.long-page-shell');

// בכמה פיקסלים עמוד הבית מורם למעלה (נקבע ב-styles.css במשתנה --home-lift)
function getHomeLift() {
  return Number.parseFloat(getComputedStyle(stage).getPropertyValue('--home-lift')) || 0;
}

function fitStageToScreen() {
  const isCompactLongPage =
    longPageShell && window.matchMedia('(max-width: 600px)').matches;
  // עמוד התהליך מוקטן במסכים צרים, אבל לא גדל מעבר לגודל המקורי (1440)
  // ובמסכים רחבים הוא נשאר באמצע.
  // עמוד הבית נכנס במלואו למסך; החלק העליון שהורם לא צריך להיכנס
  const scale = longPageShell
    ? Math.min(window.innerWidth / STAGE_WIDTH, 1)
    : Math.min(
      window.innerWidth / STAGE_WIDTH,
      window.innerHeight / (STAGE_HEIGHT - getHomeLift()),
    );
  stage.style.setProperty('--stage-scale', scale);

  if (longPageShell) {
    if (isCompactLongPage) {
      longPageShell.style.removeProperty('width');
      longPageShell.style.removeProperty('height');
    } else {
      longPageShell.style.width = `${STAGE_WIDTH * scale}px`;
      longPageShell.style.height = `${PROCESS_PAGE_HEIGHT * scale}px`;
    }
  }
}

fitStageToScreen();
window.addEventListener('resize', fitStageToScreen);

const processLink = document.querySelector('.process-link');
const headlineSoon = document.querySelector('.headline-soon');
const alienBox = document.querySelector('.alien-box');
let isLeavingForProcess = false;

function getStagePoint(rect, stageRect, scale) {
  return {
    x: (rect.left + rect.width / 2 - stageRect.left) / scale,
    y: (rect.top + rect.height / 2 - stageRect.top) / scale,
  };
}

function getRotationDegrees(element) {
  const transform = getComputedStyle(element).transform;
  if (transform === 'none') return 0;

  const matrix = new DOMMatrixReadOnly(transform);
  return Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
}

function createTitleParticle(source, stageRect, scale, rotation) {
  const rect = source.getBoundingClientRect();
  const center = getStagePoint(rect, stageRect, scale);
  const width = source.offsetWidth;
  const height = source.offsetHeight;
  const style = getComputedStyle(source);
  const element = document.createElement('span');

  element.className = 'title-animation-letter';
  element.textContent = source.textContent;
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    left: `${center.x - width / 2}px`,
    top: `${center.y - height / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
    font: style.font,
    lineHeight: style.lineHeight,
    color: style.color,
    letterSpacing: style.letterSpacing,
    transform: `rotate(${rotation}deg)`,
  });
  stage.append(element);

  return {
    element,
    center,
    width,
    rotation,
  };
}

// ===== הנפילה של "coming soon" =====
// כל אות מחליקה לאורך "מסילה" שעוברת דרך מרכזי האותיות:
// במורד האבן (coming), אל האדמה, ולאורך האדמה (soon) עד מחוץ למסך.
// אות זזה רק אחרי שאות אחרת פגעה בה, וכך הן מפעילות אחת את השנייה.

// נתוני הסימולציה (ביחידות של הבמה: פיקסלים ושניות)
const SLIDE_GRAVITY = 2600; // כוח המשיכה שמושך את האותיות במורד
const SLIDE_FRICTION = 0.18; // חיכוך עם האבן והאדמה
const SLIDE_BOUNCE = 0.35; // כמה "קפיצי" כל פגיעה בין אותיות (0 עד 1)
const SLIDE_MIN_SPEED = 450; // מהירות מינימלית על האדמה, כדי שהכול ייצא מהמסך
const SLIDE_CONTACT_GAP = 14; // מרווח קטן בין אותיות, כדי שכל פגיעה תיראה
const MAX_FRAME_TIME = 1 / 30;

// ease-in: האנימציה מתחילה לאט והקצב שלה עולה בהדרגה כל עוד היא מתנגנת
const SLIDE_START_PACE = 0.3; // בהתחלה הכול זז ב-30% מהמהירות
const SLIDE_PACE_GROWTH = 0.9; // כמה מהר הקצב עולה (גדול יותר = מאיץ מהר יותר)
const SLIDE_MAX_PACE = 3; // הקצב לא עולה מעבר לפי 3

// מחזיר את הקצב לפי הזמן שעבר (בשניות): עקומה ריבועית, כמו ease-in
function getSlidePace(elapsedTime) {
  const pace = SLIDE_START_PACE + SLIDE_PACE_GROWTH * elapsedTime * elapsedTime;
  return Math.min(pace, SLIDE_MAX_PACE);
}

// אותיות "כבדות" דוחפות חזק יותר
const MASS_BY_LETTER = {
  c: 0.85,
  o: 1.05,
  m: 1.4,
  i: 0.65,
  n: 1,
  g: 1.2,
  s: 0.95,
};

// בונה את המסילה מנקודות (מרכזי האותיות) ומחשב לכל נקודה את המרחק שלה מההתחלה
function createSlidePath(points) {
  let distance = 0;

  return points.map((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    }

    return { ...point, distance };
  });
}

// מחזיר מיקום, זווית ושיפוע בנקודה כלשהי לאורך המסילה
function getPointOnPath(path, distance) {
  let index = 1;
  while (index < path.length - 1 && path[index].distance < distance) index += 1;

  const start = path[index - 1];
  const end = path[index];
  const length = end.distance - start.distance || 1;
  const progress = (distance - start.distance) / length;

  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
    rotation: start.rotation + (end.rotation - start.rotation) * Math.min(1, Math.max(0, progress)),
    slope: (end.y - start.y) / length, // כמה המסילה יורדת כאן (0 = שטוח)
  };
}

// פגיעה בין שתי אותיות: האחורית מאטה והקדמית מקבלת דחיפה
function collideLetters(back, front) {
  const totalMass = back.mass + front.mass;
  const momentum = back.mass * back.speed + front.mass * front.speed;
  const speedDifference = back.speed - front.speed;

  back.speed = (momentum - front.mass * SLIDE_BOUNCE * speedDifference) / totalMass;
  front.speed = (momentum + back.mass * SLIDE_BOUNCE * speedDifference) / totalMass;
  front.isMoving = true;
}

async function playTitleExit() {
  await document.fonts.ready;

  const stageRect = stage.getBoundingClientRect();
  const scale = stageRect.width / STAGE_WIDTH;
  // האותיות של coming: כל אחת מסובבת בעצמה לפי השיפוע של האבן
  const comingSources = [...document.querySelectorAll('.rock-letter')];
  const soonSources = [...headlineSoon.querySelectorAll('.headline-letter')];

  // יוצר עותק לכל אות, בדיוק במקום ובזווית של המקורית
  const letters = [
    ...comingSources.map((source) => (
      createTitleParticle(source, stageRect, scale, getRotationDegrees(source))
    )),
    ...soonSources.map((source) => createTitleParticle(source, stageRect, scale, 0)),
  ];

  // הקצה הימני של החלון, ביחידות של הבמה (במסך רחב הוא רחוק יותר מ-1440)
  const screenRightEdge = (window.innerWidth - stageRect.left) / scale;

  // המסילה ממשיכה על קו האדמה עד הרבה אחרי הקצה הימני של המסך
  const lastLetter = letters[letters.length - 1];
  const path = createSlidePath([
    ...letters.map((letter) => ({ ...letter.center, rotation: letter.rotation })),
    { x: screenRightEdge + 2000, y: lastLetter.center.y, rotation: 0 },
  ]);

  letters.forEach((letter, index) => {
    letter.distance = path[index].distance;
    letter.speed = 0;
    letter.isMoving = index === 0; // רק האות הראשונה מתחילה להחליק
    letter.mass = MASS_BY_LETTER[letter.element.textContent] ?? 1;
  });

  // המרחק שבו שתי אותיות שכנות נוגעות זו בזו
  const contactDistances = letters.slice(0, -1).map((letter, index) => {
    const next = letters[index + 1];
    const naturalGap = path[index + 1].distance - path[index].distance;
    return Math.min(naturalGap, (letter.width + next.width) / 2) - SLIDE_CONTACT_GAP;
  });

  stage.classList.add('is-leaving');

  await new Promise((resolve) => {
    let previousTime = null;
    let elapsedTime = 0; // כמה זמן אמיתי עבר מתחילת האנימציה

    function step(time) {
      const realFrameTime = previousTime === null
        ? 0
        : Math.min((time - previousTime) / 1000, MAX_FRAME_TIME);
      previousTime = time;
      elapsedTime += realFrameTime;

      // זמן הסימולציה רץ לאט בהתחלה ומהר יותר ויותר (ease-in)
      const frameTime = realFrameTime * getSlidePace(elapsedTime);

      // 1. כל אות שזזה מחליקה במורד לפי השיפוע, פחות החיכוך
      letters.forEach((letter) => {
        if (!letter.isMoving) return;

        const { slope } = getPointOnPath(path, letter.distance);
        const flatness = Math.sqrt(1 - Math.min(1, slope * slope));
        const acceleration = SLIDE_GRAVITY * (slope - SLIDE_FRICTION * flatness);

        letter.speed = Math.max(0, letter.speed + acceleration * frameTime);
        if (slope < 0.05) letter.speed = Math.max(letter.speed, SLIDE_MIN_SPEED);
        letter.distance += letter.speed * frameTime;
      });

      // 2. פגיעות: אות שהגיעה לאות שלפניה מעבירה לה את התנועה
      for (let index = 0; index < letters.length - 1; index += 1) {
        const back = letters[index];
        const front = letters[index + 1];
        const overlap = back.distance + contactDistances[index] - front.distance;

        if (overlap > 0) {
          back.distance -= overlap; // האותיות לא עוברות אחת דרך השנייה
          if (back.speed > front.speed) collideLetters(back, front);
        }
      }

      // 3. מציירים כל אות במקום ובזווית החדשים שלה
      letters.forEach((letter) => {
        const point = getPointOnPath(path, letter.distance);
        letter.element.style.transform = `translate(${point.x - letter.center.x}px, ${point.y - letter.center.y}px) rotate(${point.rotation}deg)`;
      });

      // 4. ממשיכים עד שגם האות האחרונה יצאה מהמסך
      const isEveryLetterGone = letters.every((letter) => (
        getPointOnPath(path, letter.distance).x - letter.width > screenRightEdge
      ));

      if (isEveryLetterGone) resolve();
      else requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}


if (stage && processLink && headlineSoon) {
  processLink.addEventListener('click', async (event) => {
    if (isLeavingForProcess) {
      event.preventDefault();
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    event.preventDefault();
    isLeavingForProcess = true;
    processLink.setAttribute('aria-disabled', 'true');
    await playTitleExit();
    window.location.href = processLink.href;
  });
}

// הכיוון "למטה" של החייזר: הוא מסובב ב-35.29- מעלות, אז גם הצלילה שלו נוטה
const ALIEN_ROTATION_RADIANS = (-35.29 * Math.PI) / 180;
const ALIEN_HIDE_DISTANCE = 180;

function moveAlongAlien(distance) {
  const x = -Math.sin(ALIEN_ROTATION_RADIANS) * distance;
  const y = Math.cos(ALIEN_ROTATION_RADIANS) * distance;
  return `translate(${x}px, ${y}px)`;
}

if (alienBox) {
  let isAlienPeeking = false;
  const alienContent = alienBox.querySelector('.alien-box-content');

  async function hideAndRevealAlien() {
    if (isAlienPeeking) return;

    isAlienPeeking = true;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    // החייזר צולל ישר "למטה" לפי הזווית שלו (הוא עומד מסובב על האבן),
    // מחכה רגע מאחורי האבן, קופץ חזרה קצת מעל המקום שלו ונוחת בעדינות
    const animation = alienContent.animate(
      [
        { offset: 0, transform: moveAlongAlien(0), easing: 'ease-out' },
        { offset: 0.12, transform: moveAlongAlien(-4), easing: 'ease-in' },
        { offset: 0.38, transform: moveAlongAlien(ALIEN_HIDE_DISTANCE) },
        { offset: 0.62, transform: moveAlongAlien(ALIEN_HIDE_DISTANCE), easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
        { offset: 0.82, transform: moveAlongAlien(-6), easing: 'ease-in-out' },
        { offset: 0.92, transform: moveAlongAlien(2), easing: 'ease-in-out' },
        { offset: 1, transform: moveAlongAlien(0) },
      ],
      {
        duration: prefersReducedMotion ? 1 : 1300,
      },
    );
    await animation.finished;
    isAlienPeeking = false;
  }

  alienBox.addEventListener('pointerenter', hideAndRevealAlien);
  alienBox.addEventListener('focus', hideAndRevealAlien);
  alienBox.addEventListener('click', () => {
    if (window.matchMedia('(hover: none)').matches) hideAndRevealAlien();
  });
}

// ===== רעידה קטנה בכניסה לעמוד =====
// החייזר והדג רועדים קצת, כדי לרמוז שאפשר לשחק איתם
function shakeElement(element, delay) {
  element.animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-3deg)' },
      { transform: 'rotate(3deg)' },
      { transform: 'rotate(-2deg)' },
      { transform: 'rotate(2deg)' },
      { transform: 'rotate(-1deg)' },
      { transform: 'rotate(0deg)' },
    ],
    { duration: 650, delay, easing: 'ease-in-out' },
  );
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const alienToShake = document.querySelector('.alien-box-content');
  const fishToShake = document.querySelector('.fish-box');

  if (alienToShake) shakeElement(alienToShake, 500);
  if (fishToShake) shakeElement(fishToShake, 750);
}

if (fishInteractiveGroup) {
  const resizeHandles = fishInteractiveGroup.querySelectorAll('[data-resize-handle]');
  const rotationHandle = fishInteractiveGroup.querySelector('[data-rotate-handle]');
  const handleDirections = {
    'top-left': { x: -1, y: -1 },
    'top-right': { x: 1, y: -1 },
    'bottom-left': { x: -1, y: 1 },
    'bottom-right': { x: 1, y: 1 },
    'left-middle': { x: -1, y: 0 },
    'right-middle': { x: 1, y: 0 },
  };

  function getScale(axis) {
    return Number(fishInteractiveGroup.style.getPropertyValue(`--fish-scale-${axis}`)) || 1;
  }

  function setScale(axis, value) {
    const boundedValue = Math.min(4, Math.max(0.2, value));
    fishInteractiveGroup.style.setProperty(`--fish-scale-${axis}`, boundedValue);
  }

  function getRotation() {
    return Number.parseFloat(
      fishInteractiveGroup.style.getPropertyValue('--fish-rotation'),
    ) || 0;
  }

  function setRotation(value) {
    fishInteractiveGroup.style.setProperty('--fish-rotation', `${value}deg`);
  }

  function getOffset(axis) {
    return Number.parseFloat(
      fishInteractiveGroup.style.getPropertyValue(`--fish-offset-${axis}`),
    ) || 0;
  }

  function setOffset(axis, value) {
    fishInteractiveGroup.style.setProperty(`--fish-offset-${axis}`, `${value}px`);
  }

  let moveStart = null;

  fishInteractiveGroup.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (!event.target.closest('.fish-box, .selection-frame-box')) return;
    if (event.target.closest('[data-resize-handle], [data-rotate-handle]')) return;

    moveStart = {
      x: event.clientX,
      y: event.clientY,
      offsetX: getOffset('x'),
      offsetY: getOffset('y'),
      screenScale: stage.getBoundingClientRect().width / STAGE_WIDTH,
    };

    fishInteractiveGroup.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  fishInteractiveGroup.addEventListener('pointermove', (event) => {
    if (!moveStart) return;

    setOffset(
      'x',
      moveStart.offsetX + (event.clientX - moveStart.x) / moveStart.screenScale,
    );
    setOffset(
      'y',
      moveStart.offsetY + (event.clientY - moveStart.y) / moveStart.screenScale,
    );
  });

  function stopMoving() {
    moveStart = null;
  }

  fishInteractiveGroup.addEventListener('pointerup', stopMoving);
  fishInteractiveGroup.addEventListener('pointercancel', stopMoving);
  fishInteractiveGroup.addEventListener('lostpointercapture', stopMoving);

  if (rotationHandle) {
    let rotationStart = null;

    rotationHandle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;

      const screenScale = stage.getBoundingClientRect().width / STAGE_WIDTH;
      const stageRect = stage.getBoundingClientRect();
      const pointerX = (event.clientX - stageRect.left) / screenScale;
      const pointerY = (event.clientY - stageRect.top) / screenScale;
      const pivotX = 1060 + getOffset('x');
      const pivotY = 295 + getOffset('y');

      rotationStart = {
        angle: Math.atan2(pointerY - pivotY, pointerX - pivotX),
        rotation: getRotation(),
        screenScale,
        stageLeft: stageRect.left,
        stageTop: stageRect.top,
        pivotX,
        pivotY,
      };

      rotationHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    rotationHandle.addEventListener('pointermove', (event) => {
      if (!rotationStart) return;

      const pointerX = (event.clientX - rotationStart.stageLeft)
        / rotationStart.screenScale;
      const pointerY = (event.clientY - rotationStart.stageTop)
        / rotationStart.screenScale;
      const currentAngle = Math.atan2(
        pointerY - rotationStart.pivotY,
        pointerX - rotationStart.pivotX,
      );
      const angleChange = Math.atan2(
        Math.sin(currentAngle - rotationStart.angle),
        Math.cos(currentAngle - rotationStart.angle),
      );

      setRotation(rotationStart.rotation + (angleChange * 180) / Math.PI);
    });

    function stopRotating() {
      rotationStart = null;
    }

    rotationHandle.addEventListener('pointerup', stopRotating);
    rotationHandle.addEventListener('pointercancel', stopRotating);
    rotationHandle.addEventListener('lostpointercapture', stopRotating);
    rotationHandle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') setRotation(getRotation() + 3);
      else if (event.key === 'ArrowLeft') setRotation(getRotation() - 3);
      else return;

      event.preventDefault();
    });
  }

  function resizeFromKeyboard(event, target) {
    const direction = handleDirections[target.dataset.resizeHandle];
    if (!direction) return;

    const step = event.shiftKey ? 0.1 : 0.03;

    if (event.key === 'ArrowRight' && direction.x) {
      setScale('x', getScale('x') + direction.x * step);
    } else if (event.key === 'ArrowLeft' && direction.x) {
      setScale('x', getScale('x') - direction.x * step);
    } else if (event.key === 'ArrowDown' && direction.y) {
      setScale('y', getScale('y') + direction.y * step);
    } else if (event.key === 'ArrowUp' && direction.y) {
      setScale('y', getScale('y') - direction.y * step);
    } else {
      return;
    }

    event.preventDefault();
  }

  resizeHandles.forEach((target) => {
    let dragStart = null;

    target.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;

      const screenScale = stage.getBoundingClientRect().width / STAGE_WIDTH;
      const rotation = Number.parseFloat(
        getComputedStyle(stage).getPropertyValue('--handle-rotation'),
      ) * (Math.PI / 180) + (getRotation() * Math.PI) / 180;
      const direction = handleDirections[target.dataset.resizeHandle];

      dragStart = {
        x: event.clientX,
        y: event.clientY,
        scaleX: getScale('x'),
        scaleY: getScale('y'),
        screenScale,
        directionX: direction.x || 0,
        directionY: direction.y || 0,
        rotation,
      };

      target.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    target.addEventListener('pointermove', (event) => {
      if (!dragStart) return;

      const deltaX = (event.clientX - dragStart.x) / dragStart.screenScale;
      const deltaY = (event.clientY - dragStart.y) / dragStart.screenScale;
      const localDeltaX = Math.cos(dragStart.rotation) * deltaX
        + Math.sin(dragStart.rotation) * deltaY;
      const localDeltaY = -Math.sin(dragStart.rotation) * deltaX
        + Math.cos(dragStart.rotation) * deltaY;

      if (dragStart.directionX) {
        setScale('x', dragStart.scaleX + (localDeltaX * dragStart.directionX) / 300);
      }

      if (dragStart.directionY) {
        setScale('y', dragStart.scaleY + (localDeltaY * dragStart.directionY) / 250);
      }
    });

    function stopDragging() {
      dragStart = null;
    }

    target.addEventListener('pointerup', stopDragging);
    target.addEventListener('pointercancel', stopDragging);
    target.addEventListener('lostpointercapture', stopDragging);
    target.addEventListener('keydown', (event) => resizeFromKeyboard(event, target));
  });
}
