async function createScene(scene) {
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
    scene.collisionsEnabled = true;

    if (!window.MAZE_DATA) throw "no image found!";

    const { width: w, height: h, walls, spawns } = MAZE_DATA;
    const s = 2;
    window.playerSpeed = {
        default: 0.12,
        max: 0.30,
        current: 0.12
    };

    
    window.gameActive = true;  

    // Floor
    const floor = BABYLON.MeshBuilder.CreateGround("floor", { width: w * s, height: h * s }, scene);
    const floorMat = new BABYLON.StandardMaterial("floorMat", scene);
    floorMat.diffuseColor = new BABYLON.Color3(0.6, 0.3, 0.1);
    floor.material = floorMat;
    floor.checkCollisions = true;

    // Ceiling
    const ceiling = BABYLON.MeshBuilder.CreateGround("ceiling", { width: w * s, height: h * s }, scene);
    ceiling.position.y = 5;
    const ceilingMat = new BABYLON.StandardMaterial("ceilingMat", scene);
    ceilingMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.3);
    ceiling.material = ceilingMat;
    ceiling.checkCollisions = true;

    // Wall material
    const wallMaterial = new BABYLON.PBRMaterial("brick", scene);
    wallMaterial.albedoColor = new BABYLON.Color3(0.7, 0.42, 0.32);
    wallMaterial.roughness = 0.9;
    wallMaterial.metallic = 0.02;

    const brickNoise = new BABYLON.NoiseProceduralTexture("bricks", 256, scene);
    brickNoise.noiseType = BABYLON.NoiseProceduralTexture.PERLINNOISE2;
    brickNoise.octaves = 3;
    brickNoise.persistence = 0.6;
    brickNoise.uScale = 3.0;
    brickNoise.vScale = 3.0;
    wallMaterial.albedoTexture = brickNoise;
    wallMaterial.bumpTexture = brickNoise.clone();
    wallMaterial.bumpTexture.level = 0.3;

    walls.forEach(([x, y]) => {
        const b = BABYLON.MeshBuilder.CreateBox("", { width: s, height: 3, depth: s }, scene);
        b.position.set(
            (x - w / 2) * s + 0.5 * s,
            1.5,
            (y - h / 2) * s + 0.5 * s
        );
        b.checkCollisions = true;
        b.material = wallMaterial;
    });

    let pts = spawns.length ? spawns : [[Math.floor(w / 2), Math.floor(h / 2)]];
    const startIdx = Math.floor(Math.random() * pts.length);
    const start = pts.splice(startIdx, 1)[0];

    const playerX = (start[0] - w / 2) * s + 0.5 * s;
    const playerZ = (start[1] - h / 2) * s + 0.5 * s;

    const coins = [];
    const numCoins = Math.floor(pts.length / 3);
    for (let i = 0; i < numCoins; i++) {
        const idx = Math.floor(Math.random() * pts.length);
        const p = pts.splice(idx, 1)[0];
        const sphere = BABYLON.MeshBuilder.CreateSphere(`coin${i}`, { diameter: 0.8 }, scene);
        sphere.position.set(
            (p[0] - w / 2) * s + 0.5 * s,
            1.5,
            (p[1] - h / 2) * s + 0.5 * s
        );
        const coinMat = new BABYLON.StandardMaterial("", scene);
        coinMat.emissiveColor = new BABYLON.Color3(1, 1, 0.3);
        coinMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
        sphere.material = coinMat;
        coins.push(sphere);
    }

    window.collectibles = coins;
    window.player = createPlayer(scene, playerX, playerZ);

    new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    const dirLight = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -1, -1), scene);
    dirLight.intensity = 0.5;
    parent.postMessage("ready", "*");
    parent.postMessage(`spawned|${coins.length}`, "*");

    return scene;
}

function createPlayer(scene, x, z) {
    const cam = new BABYLON.FreeCamera("player", new BABYLON.Vector3(x, 1.8, z), scene);
    cam.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    cam.checkCollisions = true;
    cam.applyGravity = false;
    cam.minZ = 0.05;

    const canvas = scene.getEngine().getRenderingCanvas();

    let dragging = false;
    let prevX, prevY;

    const pointerDown = (e) => {
        if (!window.gameActive) return;
        dragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    };

    const pointerMove = (e) => {
        if (!dragging || !window.gameActive) return;
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;

        cam.cameraRotation.y += dx * 0.004;
        cam.cameraRotation.x += dy * 0.004;
        cam.cameraRotation.x = BABYLON.Scalar.Clamp(cam.cameraRotation.x, -1.48, 1.48);
    };

    const pointerUp = () => dragging = false;

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointerleave", pointerUp);
    canvas.addEventListener("contextmenu", e => e.preventDefault());

    const keys = { forward: false, backward: false, left: false, right: false };

    window.addEventListener("message", event => {
        if (!event.data || typeof event.data !== "string") return;
        const parts = event.data.split("|");

        const cmd = parts[0];
        if (cmd === "move" && parts.length === 3) {
            if (!window.gameActive) return;  
            const action = parts[1];
            const state = parts[2] === "true";
            if (action in keys) keys[action] = state;
        }
        else if (cmd === "setspeed" && parts.length === 2) {
            const val = parseFloat(parts[1]);
            if (!isNaN(val)) {
                window.playerSpeed.current = Math.max(val, window.playerSpeed.max);
            }
        }
        else if (cmd === "resetspeed") {
            window.playerSpeed.current = window.playerSpeed.default;
        }
        else if (cmd === "active" && parts.length === 2) {
            const active = parts[1] === "true";
            window.gameActive = active;

            if (!active) {
                keys.forward = keys.backward = keys.left = keys.right = false;
            }
        }
    });

    scene.registerBeforeRender(() => {
        if (!window.gameActive) return;  

        const speed = window.playerSpeed.current;
        const move = new BABYLON.Vector3();

        if (keys.forward)  move.z -= 1;
        if (keys.backward) move.z += 1;
        if (keys.left)     move.x -= 1;
        if (keys.right)    move.x += 1;

        if (move.lengthSquared() > 0.01) {
            move.normalize();

            const forward = cam.getForwardRay().direction.clone();
            const right = cam.getDirection(BABYLON.Vector3.Right());
            forward.y = right.y = 0;
            forward.normalize();
            right.normalize();

            const worldMove = forward.scale(-move.z).add(right.scale(move.x));
            worldMove.scaleInPlace(speed);

            // Anti-clipping raycast
            const ray = new BABYLON.Ray(cam.position, worldMove.normalize(), 0.45);
            const pick = scene.pickWithRay(ray, m => m.checkCollisions);

            if (!pick.hit || pick.distance > 0.35) {
                cam.cameraDirection.addInPlace(worldMove);
            }
        }
        cam.position.y = 1.8;
        window.collectibles = window.collectibles.filter((coin, i) => {
            if (!coin || coin.isDisposed()) return false;
            if (BABYLON.Vector3.DistanceSquared(cam.position, coin.position) < 1.0) {
                coin.dispose();
                parent.postMessage("collect|" + i, "*");
                parent.postMessage(`remaining|${window.collectibles.length - 1}`, "*");
                return false;
            }
            return true;
        });

        // Win condition
        if (window.collectibles.length === 0) {
            parent.postMessage("win", "*");
        }
    });

    return cam;
}