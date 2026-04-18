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
const PI_2 = Math.PI / 2 - 0.001; // 약간의 여백
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

// 무기 모델
let weapon;

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
        // 모바일 UI 활성화 및 기존 UI 숨김
        mobileUI.style.display = 'block';
        blocker.style.display = 'none';
        setupMobileControls();
    } else {
        // 데스크톱 제어
        instructions.addEventListener('click', function () {
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
    isTouchLocked = true; // 모바일은 항상 활성화 상태로 취급

    // 점프 버튼
    const jumpBtn = document.getElementById('mobile-jump-btn');
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (canJump === true) velocity.y += 10;
        canJump = false;
    }, {passive: false});

    // 조이스틱
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
        const maxDist = 50; // 조이스틱 최대 이동 반경
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        
        // 방향 계산 (1.0 기준)
        joystickMoveX = dx / maxDist;
        joystickMoveY = dy / maxDist;
    }

    // 시야 및 사격 (오른쪽 영역)
    const lookZone = document.getElementById('touch-look-zone');
    let touchLookActive = false;
    let lookTouchId = null;
    let isTap = true; // 사격 판정용

    lookZone.addEventListener('touchstart', (e) => {
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
                    isTap = false; // 움직임이 크면 탭(사격)이 아님
                }

                euler.setFromQuaternion(camera.quaternion);
                // Three.js PointerLockControls와 유사한 시야 회전 적용
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
    const weaponGroup = new THREE.Group();
    const bodyGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
    weaponGroup.add(new THREE.Mesh(bodyGeometry, material));
    
    const barrelGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4);
    barrelGeometry.rotateX(Math.PI / 2);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.z = -0.4;
    weaponGroup.add(barrel);
    
    const detailGeometry = new THREE.IcosahedronGeometry(0.06, 0);
    const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 0.5, wireframe: true });
    const detail = new THREE.Mesh(detailGeometry, detailMaterial);
    detail.position.set(0, 0.05, -0.1);
    weaponGroup.add(detail);

    weaponGroup.position.set(0.2, -0.2, -0.4);
    camera.add(weaponGroup);
    weapon = weaponGroup;
}

function spawnEnemies() {
    const geometries = [
        new THREE.TorusKnotGeometry(0.5, 0.15, 64, 8),
        new THREE.DodecahedronGeometry(0.6),
        new THREE.IcosahedronGeometry(0.6),
        new THREE.OctahedronGeometry(0.6, 1)
    ];

    for (let i = 0; i < 20; i++) {
        spawnSingleEnemy(geometries, false);
    }
}

function spawnSingleEnemy(geometries = null, checkDistance = true) {
    if (!geometries) {
        geometries = [
            new THREE.TorusKnotGeometry(0.5, 0.15, 64, 8),
            new THREE.DodecahedronGeometry(0.6),
            new THREE.IcosahedronGeometry(0.6)
        ];
    }
    const geo = geometries[Math.floor(Math.random() * geometries.length)];
    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 1.0, 0.5),
        metalness: 0.3, roughness: 0.2,
        emissive: new THREE.Color().setHSL(Math.random(), 1.0, 0.2)
    });
    const enemy = new THREE.Mesh(geo, mat);
    
    let validPosition = false;
    while (!validPosition) {
        enemy.position.set((Math.random() - 0.5) * 80, Math.random() * 3 + 1, (Math.random() - 0.5) * 80);
        if (!checkDistance || enemy.position.distanceTo(camera.position) > 10) validPosition = true;
    }
    
    enemy.userData = {
        rotX: (Math.random() - 0.5) * 0.05,
        rotY: (Math.random() - 0.5) * 0.05,
        moveSpeed: Math.random() * 0.02 + 0.01,
        moveDir: new THREE.Vector3((Math.random()-0.5), 0, (Math.random()-0.5)).normalize()
    };
    
    enemy.castShadow = true;
    scene.add(enemy);
    enemies.push(enemy);
}

function shoot() {
    if ((!isMobile && !controls.isLocked) || isReloading) return;
    if (ammo <= 0) return;

    ammo--; updateHUD();

    weapon.position.z = -0.3;
    setTimeout(() => { weapon.position.z = -0.4; }, 50);

    createMuzzleFlash();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects([...enemies, ...objects], false);

    if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        const index = enemies.indexOf(hitObject);
        if (index > -1) {
            scene.remove(hitObject);
            enemies.splice(index, 1);
            createExplosion(hitObject.position, hitObject.material.color);
            score += 100; updateHUD();
            showHitMarker();
            setTimeout(() => { spawnSingleEnemy(); }, 2000);
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
    if (isReloading || ammo === maxAmmo) return;
    isReloading = true;
    ammoElement.innerHTML = `RELOADING...`;
    ammoElement.style.color = '#ffaa00';
    const startY = weapon.position.y;
    weapon.position.y -= 0.5;
    setTimeout(() => {
        ammo = maxAmmo; isReloading = false; weapon.position.y = startY; updateHUD();
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
    ammoElement.innerHTML = `AMMO: ${ammo} / ${maxAmmo}`;
    ammoElement.style.color = ammo <= 5 ? '#ff0000' : '#ffffff';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();

    if (controls.isLocked === true || isTouchLocked) {
        raycaster.ray.origin.copy(camera.position);
        raycaster.ray.origin.y -= 1.6;
        
        let playerPos = camera.position.clone();
        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 3.0 * delta;

        // PC 키보드 입력
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        // 모바일 조이스틱 입력 (PC 입력과 섞임)
        if (isMobile) {
            direction.x = joystickMoveX;
            direction.z = -joystickMoveY; // 화면의 Y축과 3D의 Z축 반대
        }

        const speedMultiplier = 50.0;
        if (direction.z !== 0 || direction.x !== 0) {
            velocity.z -= direction.z * speedMultiplier * delta;
            velocity.x -= direction.x * speedMultiplier * delta;
        }

        // --- 수정된 Sliding 충돌 검사 (X, Z 분리) ---
        // X축 임시 위치 계산
        let nextX = playerPos.x + velocity.x * delta;
        let nextZ = playerPos.z + velocity.z * delta;
        
        // 회전을 고려한 이동 벡터 계산
        const eulerY = new THREE.Euler(0, camera.rotation.y, 0, 'YXZ');
        const movementVector = new THREE.Vector3(-velocity.x * delta, 0, -velocity.z * delta);
        movementVector.applyEuler(eulerY);

        let finalNextX = playerPos.x + movementVector.x;
        let finalNextZ = playerPos.z + movementVector.z;

        let collisionX = false;
        let collisionZ = false;
        const playerRadius = 0.6; // 벽과 너무 붙지 않게 여유 추가

        for (let i = 0; i < objects.length; i++) {
            const wall = objects[i];
            
            // X축 충돌 검사 (Z는 원래 위치 기준)
            const dxX = Math.abs(finalNextX - wall.position.x);
            const dzOriginal = Math.abs(playerPos.z - wall.position.z);
            if (dxX < 1 + playerRadius && dzOriginal < 1 + playerRadius) {
                collisionX = true;
            }

            // Z축 충돌 검사 (X는 원래 위치 기준)
            const dxOriginal = Math.abs(playerPos.x - wall.position.x);
            const dzZ = Math.abs(finalNextZ - wall.position.z);
            if (dzZ < 1 + playerRadius && dxOriginal < 1 + playerRadius) {
                collisionZ = true;
            }
        }

        // 충돌하지 않은 축만 이동 적용
        if (!collisionX) camera.position.x = finalNextX;
        if (!collisionZ) camera.position.z = finalNextZ;

        // Y축 (점프/중력)
        camera.position.y += (velocity.y * delta);

        if (camera.position.y < 1.6) {
            velocity.y = 0;
            camera.position.y = 1.6;
            canJump = true;
        }

        if ((direction.x !== 0 || direction.z !== 0) && canJump) {
            weapon.position.y = -0.2 + Math.sin(time * 0.01) * 0.02;
            weapon.position.x = 0.2 + Math.cos(time * 0.005) * 0.02;
        } else {
            weapon.position.y += (-0.2 - weapon.position.y) * 0.1;
            weapon.position.x += (0.2 - weapon.position.x) * 0.1;
        }
    }

    enemies.forEach(enemy => {
        enemy.rotation.x += enemy.userData.rotX;
        enemy.rotation.y += enemy.userData.rotY;
        enemy.position.add(enemy.userData.moveDir.clone().multiplyScalar(enemy.userData.moveSpeed));
        if (enemy.position.x > 40 || enemy.position.x < -40) enemy.userData.moveDir.x *= -1;
        if (enemy.position.z > 40 || enemy.position.z < -40) enemy.userData.moveDir.z *= -1;
    });

    prevTime = time;
    renderer.render(scene, camera);
}
