async function createScene(scene) {
    scene.clearColor = new BABYLON.Color4(0,0,0,1);
    scene.collisionsEnabled = true;

    if (!window.MAZE_DATA) throw "no image found!";

    const {width:w, height:h, walls, spawns} = MAZE_DATA;
    const s = 1;  // cell size

    // Floor
    const floor = BABYLON.MeshBuilder.CreateGround("floor", {width:w*s, height:h*s}, scene);
    const floorMat = new BABYLON.StandardMaterial("floorMat", scene);
    floorMat.diffuseColor = new BABYLON.Color3(0.2, 0.3, 0.1);
    floor.material = floorMat;
    floor.checkCollisions = true;

    // Ceiling (5 blocks high)
    const ceiling = BABYLON.MeshBuilder.CreateGround("ceiling", {width:w*s, height:h*s}, scene);
    ceiling.position.y = 5;
    const ceilingMat = new BABYLON.StandardMaterial("ceilingMat", scene);
    ceilingMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.3);
    ceiling.material = ceilingMat;
    ceiling.checkCollisions = true;

    const wallMaterial = new BABYLON.StandardMaterial("wallMat", scene);

// Create texture from image file
const wallTexture = new BABYLON.Texture("brick.jpg", scene);

wallTexture.uScale = 0.5;   // horizontal repeat
wallTexture.vScale = 1.5;   // vertical: 3 blocks tall → 3 repeats

walls.forEach(([x,y]) => {
    const b = BABYLON.MeshBuilder.CreateBox("", {width:s, height:3, depth:s}, scene);
    b.position.set((x-w/2)*s + 0.5*s, 1.5, (y-h/2)*s + 0.5*s);  // Center of cell
    b.checkCollisions = true;
    b.material = wallMaterial;
});

    let pts = spawns.length ? spawns : [[Math.floor(w/2), Math.floor(h/2)]];
    const start = pts.splice(Math.floor(Math.random()*pts.length), 1)[0];
    const playerX = (start[0] - w/2) * s + 0.5*s;  // Center spawn
    const playerZ = (start[1] - h/2) * s + 0.5*s;

    const coins = [];
    const n = Math.floor(pts.length / 3);
    for (let i = 0; i < n; i++) {
        const p = pts.splice(Math.floor(Math.random()*pts.length), 1)[0];
        const sphere = BABYLON.MeshBuilder.CreateSphere(`c${i}`, {diameter:0.8}, scene);
        sphere.position.set((p[0]-w/2)*s + 0.5*s, 1.5, (p[1]-h/2)*s + 0.5*s);
        sphere.material = new BABYLON.StandardMaterial("", scene);
        sphere.material.emissiveColor = BABYLON.Color3.Yellow();
        coins.push(sphere);
    }

    window.collectibles = coins;
    window.player = createPlayer(scene, playerX, playerZ);
    new BABYLON.HemisphericLight("", new BABYLON.Vector3(0,1,0), scene);
    return scene;
}

function createPlayer(scene, x, z) {
    const cam = new BABYLON.FreeCamera("player", new BABYLON.Vector3(x, 1.8, z), scene);

    cam.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35); 
    cam.checkCollisions = true;
    cam.applyGravity = false;
    cam.minZ = 0.05;  
    cam.keysUp = cam.keysDown = cam.keysLeft = cam.keysRight = [];
    const canvas = scene.getEngine().getRenderingCanvas();
    let dragging = false;
    let prevX, prevY;

    canvas.addEventListener("pointerdown", e => {
        dragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", e => {
        if (!dragging) return;
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;

        cam.cameraRotation.y += dx * 0.004;
        cam.cameraRotation.x += dy * 0.004;
        cam.cameraRotation.x = BABYLON.Scalar.Clamp(cam.cameraRotation.x, -1.48, 1.48);
    });

    canvas.addEventListener("pointerup", () => dragging = false);
    canvas.addEventListener("pointerleave", () => dragging = false);
    canvas.addEventListener("contextmenu", e => e.preventDefault());

    // Movement state (unchanged)
    const keys = { forward: false, backward: false, left: false, right: false };

    window.addEventListener("message", event => {
        if (!event.data || typeof event.data !== "string") return;
        const parts = event.data.split("|");
        if (parts[0] !== "move" || parts.length !== 3) return;
        const action = parts[1];
        const state = parts[2] === "true";
        if (action in keys) keys[action] = state;
    });

    // Main loop with ANTI-CLIPPING safety
    const speed = 0.12;  // Slightly slower = more stable

    scene.registerBeforeRender(() => {
        const move = new BABYLON.Vector3();

        if (keys.forward)  move.z -= 1;
        if (keys.backward) move.z += 1;
        if (keys.left)     move.x -= 1;
        if (keys.right)    move.x += 1;

        if (move.length() > 0.01) {
            move.normalize();
            const forward = cam.getForwardRay().direction.clone();
            const right = cam.getDirection(BABYLON.Vector3.Right());

            forward.y = right.y = 0;
            forward.normalize();
            right.normalize();

            const worldMove = forward.scale(-move.z).add(right.scale(move.x));
            worldMove.scaleInPlace(speed);

            // ANTI-CLIPPING: Test before moving
            const testPos = cam.position.clone().add(worldMove);
            const ray = new BABYLON.Ray(cam.position, worldMove.normalize(), 0.45); // Player radius
            const pick = scene.pickWithRay(ray, mesh => mesh.checkCollisions);

            if (!pick.hit || pick.pickedPoint.distanceTo(cam.position) > 0.35) {
                // Safe to move
                cam.cameraDirection.addInPlace(worldMove);
            }
            // Else: blocked, do nothing (perfect stop)
        }

        // Lock height + safety bounds
        cam.position.y = 1.8;
        cam.position.y = Math.max(1.7, Math.min(3.0, cam.position.y)); // Emergency bounds

        // Coin collection
        window.collectibles = window.collectibles.filter((coin, i) => {
            if (!coin || coin.isDisposed()) return false;
            if (BABYLON.Vector3.DistanceSquared(cam.position, coin.position) < 1.0) {
                coin.dispose();
                parent.postMessage("collect|" + i, "*");
                return false;
            }
            return true;
        });
    });

    return cam;
}