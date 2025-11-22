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
    const cam = new BABYLON.FreeCamera("", new BABYLON.Vector3(x,1.6,z), scene);
    cam.setTarget(new BABYLON.Vector3(x+1,1.6,z));
    cam.ellipsoid = new BABYLON.Vector3(0.4,0.8,0.4);
    cam.checkCollisions = true;
    
    // Movement state
    let moveState = 'idle';
    let moveDirection = new BABYLON.Vector3(0, 0, 0);

    // Keyboard input handling
    window.addEventListener('message', function(event) {
        if (event.data && typeof event.data === 'string') {
            const parts = event.data.split('|');
            if (parts[0] === 'move') {
                moveState = parts[1]; // forward, backward, left, right, idle
            }
        }
    });

    let dragging = false, px = 0, py = 0;
    const canvas = scene.getEngine().getRenderingCanvas();

    const down = e => { dragging = true; px = e.clientX; py = e.clientY; };
    const move = e => {
        if (!dragging) return;
        const dx = e.clientX - px, dy = e.clientY - py;
        px = e.clientX; py = e.clientY;
        cam.cameraRotation.y += dx * 0.003;
        cam.cameraRotation.x += dy * 0.003;
        cam.cameraRotation.x = Math.max(-1.5, Math.min(1.5, cam.cameraRotation.x));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", () => dragging = false);
    canvas.addEventListener("pointerleave", () => dragging = false);
    canvas.addEventListener("contextmenu", e => e.preventDefault());

    scene.registerBeforeRender(() => {
        // Handle movement based on state
        if (moveState !== 'idle') {
            let moveVec = new BABYLON.Vector3(0, 0, 0);
            
            switch (moveState) {
                case 'forward':
                    moveVec = cam.getForwardRay().direction;
                    break;
                case 'backward':
                    moveVec = cam.getForwardRay().direction.negate();
                    break;
                case 'left':
                    moveVec = cam.getDirection(BABYLON.Vector3.Left());
                    break;
                case 'right':
                    moveVec = cam.getDirection(BABYLON.Vector3.Right());
                    break;
            }
            
            // Remove vertical component and normalize
            moveVec.y = 0;
            moveVec.normalize();
            
            // Apply movement
            cam.position.addInPlace(moveVec.scale(0.15));
            cam.position.y = 1.6; // Keep at player height
        }

        // Collect coins
        window.collectibles = window.collectibles.filter((s, i) => {
            if (!s || s.isDisposed()) return false;
            if (BABYLON.Vector3.Distance(cam.position, s.position) < 1) {
                s.dispose();
                parent.postMessage("collect|" + i, "*");
                return false;
            }
            return true;
        });
    });

    return cam;
}