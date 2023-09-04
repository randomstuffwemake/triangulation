const canvas = document.getElementById("canvasDelauny");
const ctx = canvas.getContext("2d");
const video = document.getElementById("video");

import {
    HandLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

let handLandmarker;
let isPinched = false;
let drawPinchFlag = true;
let lastVideoTime = -1;

async function createHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
    });
}

const rectCoords = [
    { x: 0, y: 0 },
    { x: canvas.width, y: 0 },
    { x: canvas.width, y: canvas.height },
    { x: 0, y: canvas.height }
];

const dots = [];

function drawRectangle(coords, color) {
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.lineTo(coords[0].x, coords[0].y);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.closePath();
}

function drawDot(coord, color) {
    ctx.beginPath();
    ctx.arc(coord.x, coord.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.closePath();
}

function triangulateAndDraw() {
    const points = [...rectCoords, ...dots].flatMap(p => [p.x, p.y]);
    const delaunay = new window.Delaunator(points);
    const triangles = delaunay.triangles;
    for (let i = 0; i < triangles.length; i += 3) {
        const coords = [
            { x: points[2 * triangles[i]], y: points[2 * triangles[i] + 1] },
            { x: points[2 * triangles[i + 1]], y: points[2 * triangles[i + 1] + 1] },
            { x: points[2 * triangles[i + 2]], y: points[2 * triangles[i + 2] + 1] },
        ];
        drawRectangle(coords, "#FFFFFF");
    }
}

function drawScene() {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawRectangle(rectCoords, "#FFFFFF", 2);
    dots.forEach(dot => drawDot(dot, "#FFFFFF"));
    if (dots.length > 0) {
        triangulateAndDraw();
    }
}

canvas.addEventListener("click", function(event) {
    const x = event.clientX - canvas.getBoundingClientRect().left;
    const y = event.clientY - canvas.getBoundingClientRect().top;
    dots.push({ x: x, y: y });
    drawScene();
});

drawScene();

function calculateDistance(point1, point2) {
    return Math.sqrt((point1.x - point2.x) ** 2 + (point1.y - point2.y) ** 2);
}

function processDetections(detections) {
    if (detections.handednesses.length) {
        const indexTip = detections.landmarks[0][8];
        const thumbTip = detections.landmarks[0][4];
        if (calculateDistance(indexTip, thumbTip) < 0.04) {
            isPinched = true;
        } else {
            isPinched = false;
            drawPinchFlag = true;
        }
        if (isPinched && drawPinchFlag) {
            drawPinchFlag = false;
            const pinchCoordinate = { x: ((indexTip.x + thumbTip.x) / 2), y:  ((indexTip.y + thumbTip.y) / 2) }
            dots.push({ x: canvas.width - pinchCoordinate.x * video.width, y: pinchCoordinate.y * video.height });
            drawScene();
        }
    }
}

function startDetection() {
    let startTimeMs = performance.now();
    if (video.currentTime !== lastVideoTime) {
        const detections = handLandmarker.detectForVideo(video, startTimeMs);
        processDetections(detections);
        lastVideoTime = video.currentTime;
    }
    window.requestAnimationFrame(startDetection);
}

navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } }).then( async function(mediaStream) {
    video.srcObject = mediaStream;
    video.play();
    video.addEventListener("loadeddata", async () => {
        await createHandLandmarker();
        startDetection();
    });
});