async function createScene(scene) {
    scene.clearColor = new BABYLON.Color4(0,0,0,1);
    scene.collisionsEnabled = true;

    if (!window.MAZE_DATA) throw "no image found!";

    const {width:w, height:h, walls, spawns} = MAZE_DATA;
    const s = 2;  // cell size

    // Create floor with a distinct color
    const floor = BABYLON.MeshBuilder.CreateGround("floor", {width:w*s, height:h*s}, scene);
    const floorMat = new BABYLON.StandardMaterial("floorMat", scene);
    floorMat.diffuseColor = new BABYLON.Color3(0.2, 0.3, 0.1); // Dark green
    floor.material = floorMat;

    // Create ceiling higher up
    const ceiling = BABYLON.MeshBuilder.CreateGround("ceiling", {width:w*s, height:h*s}, scene);
    ceiling.position.y = 3; // Higher ceiling for 2-unit walls
    const ceilingMat = new BABYLON.StandardMaterial("ceilingMat", scene);
    ceilingMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.3); // Dark blue
    ceiling.material = ceilingMat;

    // Create different materials for walls
    const wallMaterials = [
        new BABYLON.StandardMaterial("wallMat1", scene),
        new BABYLON.StandardMaterial("wallMat2", scene),
        new BABYLON.StandardMaterial("wallMat3", scene)
    ];
    
    wallMaterials[0].diffuseColor = new BABYLON.Color3(0.7, 0.3, 0.3); // Reddish
    wallMaterials[1].diffuseColor = new BABYLON.Color3(0.3, 0.7, 0.3); // Greenish  
    wallMaterials[2].diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.7); // Bluish

    walls.forEach(([x,y], index) => {
        // Create walls with height of 2 (like Minecraft blocks)
        const b = BABYLON.MeshBuilder.CreateBox("", {width:s, height:2, depth:s}, scene);
        b.position.set((x-w/2)*s, 1, (y-h/2)*s); // Position at y=1 so top is at y=2
        b.checkCollisions = true;
        
        // Use alternating materials for better visual distinction
        b.material = wallMaterials[index % wallMaterials.length];
    });

    let pts = spawns.length ? spawns : [[Math.floor(w/2), Math.floor(h/2)]];
    const start = pts.splice(Math.floor(Math.random()*pts.length), 1)[0];
    const playerX = (start[0] - w/2) * s;
    const playerZ = (start[1] - h/2) * s;

    const coins = [];
    const n = Math.floor(pts.length / 3);
    for (let i = 0; i < n; i++) {
        const p = pts.splice(Math.floor(Math.random()*pts.length), 1)[0];
        const sphere = BABYLON.MeshBuilder.CreateSphere(`c${i}`, {diameter:1}, scene);
        sphere.position.set((p[0]-w/2)*s, 1, (p[1]-h/2)*s);
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
    const cam = new BABYLON.FreeCamera("player", new BABYLON.Vector3(x, 1.6, z), scene);

    // COLLISION — this is all you need
    cam.ellipsoid = new BABYLON.Vector3(0.4, 0.8, 0.4);
    cam.checkCollisions = true;
    cam.applyGravity = false;
    cam.keysUp = cam.keysDown = cam.keysLeft = cam.keysRight = []; // disable built-in keys

    const canvas = scene.getEngine().getRenderingCanvas();

    // ——————————————————————————
    // 1. Look around (mouse/touch drag)
    // ——————————————————————————
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

    canvas.addEventListener("pointerup",   () => dragging = false);
    canvas.addEventListener("pointerleave", () => dragging = false);
    canvas.addEventListener("contextmenu", e => e.preventDefault());

    // ——————————————————————————
    // 2. Movement state — driven 100% by parent messages
    // ——————————————————————————
    const keys = {
        forward:  false,
        backward: false,
        left:     false,
        right:    false
    };

    window.addEventListener("message", event => {
        if (!event.data || typeof event.data !== "string") return;
        const parts = event.data.split("|");
        if (parts[0] !== "move" || parts.length !== 3) return;

        const action = parts[1];     // "forward" | "backward" | "left" | "right"
        const state  = parts[2] === "true";

        if (action in keys) {
            keys[action] = state;
        }
    });

    // ——————————————————————————
    // 3. Main loop — pure, clean, collision-perfect
    // ——————————————————————————
    const speed = 0.16;

    scene.registerBeforeRender(() => {
        const move = new BABYLON.Vector3();

        if (keys.forward)  move.z -= 1;
        if (keys.backward) move.z += 1;
        if (keys.left)     move.x -= 1;
        if (keys.right)    move.x += 1;

        if (move.length() > 0.01) {
            move.normalize();
            const forward = cam.getForwardRay().direction.clone();
            const right   = cam.getDirection(BABYLON.Vector3.Right());

            forward.y = right.y = 0;
            forward.normalize();
            right.normalize();

            const worldMove = forward.scale(-move.z).add(right.scale(move.x));
            worldMove.scaleInPlace(speed);

            // This one line = perfect collision + wall sliding
            cam.cameraDirection.addInPlace(worldMove);
        }

        cam.position.y = 1.6;  // lock height
        window.collectibles = window.collectibles.filter((coin, i) => {
            if (!coin || coin.isDisposed()) return false;
            if (BABYLON.Vector3.DistanceSquared(cam.position, coin.position) < 1.2) {
                coin.dispose();
                parent.postMessage("collect|" + i, "*");
                return false;
            }
            return true;
        });
    });

    return cam;
}