import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- 전역 변수 설정 ---
let camera, scene, renderer, controls;
const objects = []; 
const enemies = []; 
let raycaster;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

// 모바일 변수
let isMobile = false;
let joystickMoveX = 0;
let joystickMoveY = 0;
let touchLookPreviousX = 0;
let touchLookPreviousY = 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const PI_2 = Math.PI / 2 - 0.001; 
let isTouchLocked = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const color = new THREE.Color();

let score = 0;
const maxAmmo = 30;
let ammo = maxAmmo;
let isReloading = false;

const scoreElement = document.getElementById('score');
const ammoElement = document.getElementById('ammo');
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const mobileUI = document.getElementById('mobile-ui');

// 무기 모델 및 스위칭
let weapon;
let gunGroup, knifeGroup;
let currentWeaponIndex = 0; // 0: Gun, 1: Knife
let isSwitching = false;
let knifeSpinAngle = 0;

init();
animate();

function init() {
    isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; 

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.Fog(0x111111, 0, 50);

    const light = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);
    light.position.set(0.5, 1, 0.75);
    scene.add(light);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(20, 20, 20);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    scene.add(dirLight);

    controls = new PointerLockControls(camera, document.body);
    scene.add(controls.getObject());

    if (isMobile) {
        mobileUI.style.display = 'block';
        blocker.style.display = 'none';
        setupMobileControls();
    } else {
        instructions.addEventListener('click', function () {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            controls.lock();
        });
        controls.addEventListener('lock', function () {
            instructions.style.display = 'none';
            blocker.style.display = 'none';
        });
        controls.addEventListener('unlock', function () {
            blocker.style.display = 'flex';
            instructions.style.display = '';
        });

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('mousedown', shoot);
    }

    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    const floorGeometry = new THREE.PlaneGeometry(100, 100, 50, 50);
    floorGeometry.rotateX(-Math.PI / 2);
    let position = floorGeometry.attributes.position;
    const colorsFloor = [];
    for (let i = 0, l = position.count; i < l; i++) {
        color.setHSL(Math.random() * 0.1 + 0.5, 0.75, Math.random() * 0.25 + 0.25);
        colorsFloor.push(color.r, color.g, color.b);
    }
    floorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsFloor, 3));
    const floorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.receiveShadow = true;
    scene.add(floor);

    createEnvironment();
    createWeapon();
    spawnEnemies();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);
}

function setupMobileControls() {
    isTouchLocked = true;

    const jumpBtn = document.getElementById('mobile-jump-btn');
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (canJump === true) velocity.y += 10;
        canJump = false;
    }, {passive: false});

    const reloadBtn = document.getElementById('mobile-reload-btn');
    reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        reload();
    }, {passive: false});
    
    // 무기 스위치 버튼
    document.getElementById('mobile-gun-btn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        switchWeapon(0);
    }, {passive: false});
    document.getElementById('mobile-knife-btn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        switchWeapon(1);
    }, {passive: false});

    const joystickZone = document.getElementById('joystick-zone');
    const joystickStick = document.getElementById('joystick-stick');
    let joystickActive = false;
    let stickCenter = {x:0, y:0};

    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        joystickActive = true;
        const rect = joystickZone.getBoundingClientRect();
        stickCenter.x = rect.left + rect.width / 2;
        stickCenter.y = rect.top + rect.height / 2;
        updateJoystick(e.changedTouches[0]);
    }, {passive: false});

    joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joystickActive) return;
        updateJoystick(e.changedTouches[0]);
    }, {passive: false});

    const endJoystick = (e) => {
        e.preventDefault();
        joystickActive = false;
        joystickStick.style.transform = `translate(-50%, -50%)`;
        joystickMoveX = 0;
        joystickMoveY = 0;
    };
    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);

    function updateJoystick(touch) {
        let dx = touch.clientX - stickCenter.x;
        let dy = touch.clientY - stickCenter.y;
        const maxDist = 50; 
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        joystickMoveX = dx / maxDist;
        joystickMoveY = dy / maxDist;
    }

    const lookZone = document.getElementById('touch-look-zone');
    let touchLookActive = false;
    let lookTouchId = null;
    let isTap = true; 

    lookZone.addEventListener('touchstart', (e) => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        e.preventDefault();
        const touch = e.changedTouches[0];
        lookTouchId = touch.identifier;
        touchLookPreviousX = touch.clientX;
        touchLookPreviousY = touch.clientY;
        touchLookActive = true;
        isTap = true;
    }, {passive: false});

    lookZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!touchLookActive) return;
        
        for(let i=0; i<e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === lookTouchId) {
                const touch = e.changedTouches[i];
                const movementX = touch.clientX - touchLookPreviousX;
                const movementY = touch.clientY - touchLookPreviousY;
                
                if (Math.abs(movementX) > 2 || Math.abs(movementY) > 2) {
                    isTap = false; 
                }

                euler.setFromQuaternion(camera.quaternion);
                euler.y -= movementX * 0.005;
                euler.x -= movementY * 0.005;
                euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
                camera.quaternion.setFromEuler(euler);

                touchLookPreviousX = touch.clientX;
                touchLookPreviousY = touch.clientY;
            }
        }
    }, {passive: false});

    lookZone.addEventListener('touchend', (e) => {
        e.preventDefault();
        for(let i=0; i<e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === lookTouchId) {
                touchLookActive = false;
                if (isTap) {
                    shoot();
                }
            }
        }
    }, {passive: false});
}

const onKeyDown = function (event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump === true) velocity.y += 10; canJump = false; break;
        case 'KeyR': reload(); break;
        case 'Digit1': switchWeapon(0); break;
        case 'Digit2': switchWeapon(1); break;
    }
};

const onKeyUp = function (event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
    }
};

function createEnvironment() {
    const boxGeometry = new THREE.BoxGeometry(2, 4, 2);
    for (let i = 0; i < 40; i++) {
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(Math.random() * 0.2 + 0.5, 0.8, 0.5),
            roughness: 0.4, metalness: 0.6
        });
        const box = new THREE.Mesh(boxGeometry, material);
        box.position.set(Math.floor(Math.random() * 20 - 10) * 4, 2, Math.floor(Math.random() * 20 - 10) * 4);
        if (box.position.distanceTo(new THREE.Vector3(0,2,0)) > 5) {
            box.castShadow = true; box.receiveShadow = true;
            scene.add(box); objects.push(box);
        }
    }
}

function createWeapon() {
    weapon = new THREE.Group();
    camera.add(weapon);
    
    // --- 총 생성 ---
    gunGroup = new THREE.Group();
    const bodyGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
    gunGroup.add(new THREE.Mesh(bodyGeometry, material));
    
    const barrelGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4);
    barrelGeometry.rotateX(Math.PI / 2);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.z = -0.4;
    gunGroup.add(barrel);
    
    const detailGeometry = new THREE.IcosahedronGeometry(0.06, 0);
    const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 0.5, wireframe: true });
    const detail = new THREE.Mesh(detailGeometry, detailMaterial);
    detail.position.set(0, 0.05, -0.1);
    gunGroup.add(detail);

    gunGroup.position.set(0.2, -0.2, -0.4);
    weapon.add(gunGroup);
    
    // --- 칼 생성 ---
    knifeGroup = new THREE.Group();
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15), handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.1;
    knifeGroup.add(handle);
    
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1.0, roughness: 0.2 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.3), bladeMat);
    
    // 칼날 한쪽 뾰족하게 깎기
    const bladeGeo = blade.geometry;
    const positions = bladeGeo.attributes.position;
    for(let i=0; i<positions.count; i++) {
        if(positions.getZ(i) < 0 && positions.getY(i) > 0) {
            positions.setY(i, 0); // 위쪽을 깎아서 뾰족하게
        }
    }
    bladeGeo.computeVertexNormals();
    blade.position.z = -0.15;
    knifeGroup.add(blade);
    
    knifeGroup.position.set(0.2, -0.2, -0.4);
    weapon.add(knifeGroup);
    
    // 기본 설정
    gunGroup.visible = true;
    knifeGroup.visible = false;
}

function switchWeapon(index) {
    if (isSwitching || currentWeaponIndex === index) return;
    currentWeaponIndex = index;
    isSwitching = true;
    
    if (isMobile) {
        document.getElementById('mobile-gun-btn').classList.toggle('active', index === 0);
        document.getElementById('mobile-knife-btn').classList.toggle('active', index === 1);
    }
    
    const dropTime = 200; 
    let startTime = performance.now();
    
    function animateDrop() {
        let elapsed = performance.now() - startTime;
        if (elapsed < dropTime) {
            weapon.position.y = - (elapsed / dropTime) * 0.8;
            requestAnimationFrame(animateDrop);
        } else {
            gunGroup.visible = (index === 0);
            knifeGroup.visible = (index === 1);
            
            if (index === 1) {
                knifeSpinAngle = Math.PI * 4; // 칼 2바퀴 돌리기
            } else {
                knifeGroup.rotation.set(0, 0, 0);
            }
            
            startTime = performance.now();
            function animateRaise() {
                let elapsed2 = performance.now() - startTime;
                if (elapsed2 < dropTime) {
                    let progress = elapsed2 / dropTime;
                    weapon.position.y = -0.8 + progress * 0.8;
                    
                    if (index === 1) {
                        knifeGroup.rotation.x = knifeSpinAngle * (1 - progress);
                    }
                    
                    requestAnimationFrame(animateRaise);
                } else {
                    weapon.position.y = 0;
                    if (index === 1) knifeGroup.rotation.x = 0;
                    isSwitching = false;
                    updateHUD(); // 탄약 표시 업데이트
                }
            }
            animateRaise();
        }
    }
    animateDrop();
}

function spawnEnemies() {
    for (let i = 0; i < 15; i++) {
        spawnSingleEnemy();
    }
}

function spawnSingleEnemy() {
    const humanoid = new THREE.Group();
    
    const hue = Math.random();
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.8, 0.6), roughness: 0.4 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.6, 0.4), roughness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), headMat);
    head.position.y = 2.6;
    head.name = 'head';
    head.castShadow = true;
    humanoid.add(head);
    
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.5), bodyMat);
    body.position.y = 1.7;
    body.name = 'body';
    body.castShadow = true;
    humanoid.add(body);
    
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), legMat);
    leftLeg.position.set(-0.25, 0.55, 0);
    leftLeg.name = 'legs';
    leftLeg.castShadow = true;
    humanoid.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), legMat);
    rightLeg.position.set(0.25, 0.55, 0);
    rightLeg.name = 'legs';
    rightLeg.castShadow = true;
    humanoid.add(rightLeg);
    
    humanoid.userData = {
        isHumanoid: true,
        health: 12,
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        walkCycle: Math.random() * Math.PI * 2,
        moveSpeed: Math.random() * 2 + 1.5,
        moveDir: new THREE.Vector3((Math.random()-0.5), 0, (Math.random()-0.5)).normalize()
    };
    
    let validPosition = false;
    while (!validPosition) {
        humanoid.position.set((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80);
        if (humanoid.position.distanceTo(camera.position) > 15) validPosition = true;
    }
    
    scene.add(humanoid);
    enemies.push(humanoid);
}

function shoot() {
    if ((!isMobile && !controls.isLocked) || isSwitching) return;
    
    if (currentWeaponIndex === 0) {
        // 총 사격
        if (isReloading || ammo <= 0) return;
        ammo--; updateHUD();
        playGunshot();
        
        gunGroup.position.z = -0.3;
        setTimeout(() => { gunGroup.position.z = -0.4; }, 50);
        createMuzzleFlash();
        
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        raycaster.far = 1000;
    } else {
        // 칼 공격
        playKnifeSwing();
        knifeGroup.position.z = -0.7;
        knifeGroup.rotation.y = -Math.PI / 4;
        setTimeout(() => { 
            knifeGroup.position.z = -0.4; 
            knifeGroup.rotation.y = 0;
        }, 150);
        
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        raycaster.far = 3.0; // 근거리
    }

    // recursive: true 로 설정하여 그룹 내의 부위(Mesh)까지 검사
    const intersects = raycaster.intersectObjects([...enemies, ...objects], true);

    if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        
        // 인간형 적 피격 판별
        if (hitObject.parent && hitObject.parent.userData && hitObject.parent.userData.isHumanoid) {
            const humanoid = hitObject.parent;
            const part = hitObject.name;
            
            let damage = 0;
            if (part === 'head') damage = 12; // 1방
            else if (part === 'body') damage = 4; // 3방
            else if (part === 'legs') damage = 3; // 4방
            
            humanoid.userData.health -= damage;
            
            if (currentWeaponIndex === 0) {
                createExplosion(intersects[0].point, hitObject.material.color);
            } else {
                playKnifeHit();
                createExplosion(intersects[0].point, new THREE.Color(0xff0000)); // 피 효과
            }
            
            showHitMarker();
            
            if (humanoid.userData.health <= 0) {
                scene.remove(humanoid);
                const index = enemies.indexOf(humanoid);
                if (index > -1) enemies.splice(index, 1);
                score += 100; updateHUD();
                setTimeout(() => { spawnSingleEnemy(); }, 2000);
            }
        }
    }
}

function createMuzzleFlash() {
    const flashGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(camera.position);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    flash.position.add(dir.multiplyScalar(0.6));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    flash.position.add(right.multiplyScalar(0.2));
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
    flash.position.add(down.multiplyScalar(0.2));
    flash.lookAt(camera.position);
    scene.add(flash);
    flash.scale.set(Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, 1);
    flash.rotation.z = Math.random() * Math.PI;
    setTimeout(() => { scene.remove(flash); }, 50);
}

function createExplosion(position, color) {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = position.x; positions[i * 3 + 1] = position.y; positions[i * 3 + 2] = position.z;
        velocities.push((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: color, size: 0.2, transparent: true, opacity: 1 });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const start = performance.now();
    function animateParticles() {
        const elapsed = performance.now() - start;
        if (elapsed > 500) {
            scene.remove(particles); geometry.dispose(); material.dispose(); return;
        }
        const positions = particles.geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] += velocities[i * 3];
            positions[i * 3 + 1] += velocities[i * 3 + 1] - 0.01;
            positions[i * 3 + 2] += velocities[i * 3 + 2];
        }
        particles.geometry.attributes.position.needsUpdate = true;
        material.opacity = 1 - (elapsed / 500);
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
}

function reload() {
    if (isReloading || ammo === maxAmmo || currentWeaponIndex === 1) return;
    isReloading = true;
    ammoElement.innerHTML = `RELOADING...`;
    ammoElement.style.color = '#ffaa00';
    const startY = gunGroup.position.y;
    gunGroup.position.y -= 0.5;
    setTimeout(() => {
        ammo = maxAmmo; isReloading = false; gunGroup.position.y = startY; updateHUD();
    }, 1500);
}

function showHitMarker() {
    let hitMarker = document.querySelector('.hit-marker');
    if (!hitMarker) {
        hitMarker = document.createElement('div');
        hitMarker.className = 'hit-marker';
        document.body.appendChild(hitMarker);
    }
    hitMarker.classList.remove('active');
    void hitMarker.offsetWidth;
    hitMarker.classList.add('active');
    setTimeout(() => { hitMarker.classList.remove('active'); }, 100);
}

function updateHUD() {
    scoreElement.innerHTML = `SCORE: ${score}`;
    if (currentWeaponIndex === 0) {
        ammoElement.style.display = 'block';
        ammoElement.innerHTML = `AMMO: ${ammo} / ${maxAmmo}`;
        ammoElement.style.color = ammo <= 5 ? '#ff0000' : '#ffffff';
    } else {
        ammoElement.style.display = 'none'; // 칼일 때는 탄약 숨김
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked === true || isTouchLocked) {
        raycaster.ray.origin.copy(camera.position);
        raycaster.ray.origin.y -= 1.6;
        
        let playerPos = camera.position.clone();

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 3.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (isMobile) {
            direction.x = joystickMoveX;
            direction.z = -joystickMoveY; 
        }

        const speedMultiplier = 50.0;
        if (direction.z !== 0 || direction.x !== 0) {
            velocity.z -= direction.z * speedMultiplier * delta;
            velocity.x -= direction.x * speedMultiplier * delta;
        }

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        right.normalize();

        const movementVector = new THREE.Vector3();
        movementVector.addScaledVector(right, -velocity.x * delta);
        movementVector.addScaledVector(forward, -velocity.z * delta);

        let finalNextX = playerPos.x + movementVector.x;
        let finalNextZ = playerPos.z + movementVector.z;

        let collisionX = false;
        let collisionZ = false;
        const playerRadius = 0.6; 

        for (let i = 0; i < objects.length; i++) {
            const wall = objects[i];
            const dxX = Math.abs(finalNextX - wall.position.x);
            const dzOriginal = Math.abs(playerPos.z - wall.position.z);
            if (dxX < 1 + playerRadius && dzOriginal < 1 + playerRadius) collisionX = true;

            const dxOriginal = Math.abs(playerPos.x - wall.position.x);
            const dzZ = Math.abs(finalNextZ - wall.position.z);
            if (dzZ < 1 + playerRadius && dxOriginal < 1 + playerRadius) collisionZ = true;
        }

        if (!collisionX) camera.position.x = finalNextX;
        if (!collisionZ) camera.position.z = finalNextZ;

        camera.position.y += (velocity.y * delta);

        if (camera.position.y < 1.6) {
            velocity.y = 0;
            camera.position.y = 1.6;
            canJump = true;
        }

        if ((direction.x !== 0 || direction.z !== 0) && canJump && !isSwitching) {
            weapon.position.y = -0.2 + Math.sin(time * 0.01) * 0.02;
            weapon.position.x = 0.2 + Math.cos(time * 0.005) * 0.02;
        } else if (!isSwitching) {
            weapon.position.y += (-0.2 - weapon.position.y) * 0.1;
            weapon.position.x += (0.2 - weapon.position.x) * 0.1;
        }
    }

    // 인간형 적 애니메이션 (걷기)
    enemies.forEach(enemy => {
        // 이동 로직
        enemy.position.add(enemy.userData.moveDir.clone().multiplyScalar(enemy.userData.moveSpeed * delta));
        
        // 경계 반사
        if (enemy.position.x > 40 || enemy.position.x < -40) enemy.userData.moveDir.x *= -1;
        if (enemy.position.z > 40 || enemy.position.z < -40) enemy.userData.moveDir.z *= -1;
        
        // 이동 방향 바라보기
        const lookTarget = enemy.position.clone().add(enemy.userData.moveDir);
        enemy.lookAt(lookTarget);
        
        // 다리 교차 애니메이션
        enemy.userData.walkCycle += delta * 15;
        enemy.userData.leftLeg.rotation.x = Math.sin(enemy.userData.walkCycle) * 0.6;
        enemy.userData.rightLeg.rotation.x = Math.cos(enemy.userData.walkCycle) * 0.6;
    });

    prevTime = time;
    renderer.render(scene, camera);
}

// --- 오디오 처리 ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playGunshot() {
    initAudio();
    if (!audioCtx) return;
    
    const bufferSize = audioCtx.sampleRate * 0.2; 
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 4000;
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(1.5, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    
    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(1.5, audioCtx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    
    noiseSource.start();
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}

function playKnifeSwing() {
    initAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function playKnifeHit() {
    initAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(1.0, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}
