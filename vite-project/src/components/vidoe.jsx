import {
  useEffect,
  useRef,
  useState,
} from 'react';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function Apple() {
  const videoRef = useRef();
  const canvasRef = useRef();
  const fileInputRef = useRef();
  const reportRef = useRef();
  const messagesEndRef = useRef();
  const [badMessages, setBadMessages] = useState([]);
  const [useWebcam, setUseWebcam] = useState(true);

  // Track last posture state
  const lastPostureRef = useRef("good");

  let pose;

  useEffect(() => {
    pose = new window.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults(onResults);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [badMessages]);

  function onResults(results) {
    const canvasCtx = canvasRef.current.getContext("2d");
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

    if (results.poseLandmarks) {
      window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 3,
      });
      window.drawLandmarks(canvasCtx, results.poseLandmarks, {
        color: "#FF0000",
        lineWidth: 2,
      });

      const msg = checkPosture(results.poseLandmarks);

      if (msg) {
        if (lastPostureRef.current === "good") {
          setBadMessages((prev) => {
            if (prev.length < 50) {
              return [...prev, msg];
            } else {
              return prev;
            }
          });

          sendToBackend(msg);
          lastPostureRef.current = "bad";
        }
      } else {
        lastPostureRef.current = "good";
      }
    }
  }

  function checkPosture(landmarks) {
    const leftShoulder = landmarks[11];
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const nose = landmarks[0];

    const backAngle = getAngle(leftShoulder, leftHip, leftKnee);
    if (backAngle < 150) {
      return "⚠️ Back angle < 150° — Bad posture!";
    }

    if (leftKnee.x > leftAnkle.x + 0.05) {
      return "⚠️ Knee over toe — Bad posture!";
    }

    if (Math.abs(nose.x - leftShoulder.x) > 0.1) {
      return "⚠️ Neck bent > 30° — Bad posture!";
    }

    return null;
  }

  function getAngle(a, b, c) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const cb = { x: b.x - c.x, y: b.y - c.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
    const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
    const angle = Math.acos(dot / (magAB * magCB));
    return (angle * 180) / Math.PI;
  }

  function startWebcam() {
    setUseWebcam(true);
    setBadMessages([]);
    lastPostureRef.current = "good";
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        processFrames();
      })
      .catch((err) => console.error(err));
  }

  function handleFileChange(e) {
    setUseWebcam(false);
    setBadMessages([]);
    lastPostureRef.current = "good";
    const file = e.target.files[0];
    if (file) {
      const videoURL = URL.createObjectURL(file);
      videoRef.current.src = videoURL;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current.pause();
        processUploadedVideo();
      };
    }
  }

  function processFrames() {
    const process = async () => {
      if (!videoRef.current.paused && !videoRef.current.ended) {
        await pose.send({ image: videoRef.current });
        requestAnimationFrame(process);
      }
    };
    process();
  }

  function processUploadedVideo() {
    const video = videoRef.current;
    if (!video) return;

    const step = 0.033;

    const process = async () => {
      if (video.currentTime >= video.duration) return;

      await pose.send({ image: video });
      video.currentTime += step;

      setTimeout(() => {
        process();
      }, 33);
    };

    video.currentTime = 0;
    process();
  }

  async function sendToBackend(message) {
    try {
      await fetch("https://your-backend.onrender.com/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    } catch (error) {
      console.error("Error saving log:", error);
    }
  }

  async function exportPDF() {
    const input = reportRef.current;
    if (!input) return;

    await new Promise((resolve) => setTimeout(resolve, 500));

    const canvas = await html2canvas(input, {
      scale: 2,
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF();
    pdf.addImage(imgData, "PNG", 10, 10, 190, 0);
    pdf.save("posture-report.pdf");
  }

  function resetAnalysis() {
    setBadMessages([]);
    lastPostureRef.current = "good";
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8">
      <h1 className="text-3xl font-bold text-blue-600 mb-6">🧍‍♂️ Posture Detection App</h1>
      <div className="flex gap-4 mb-4">
        <button onClick={startWebcam} className="px-4 py-2 bg-green-500 text-white rounded shadow hover:bg-green-600">
          Use Webcam
        </button>
        <button onClick={() => fileInputRef.current.click()} className="px-4 py-2 bg-indigo-500 text-white rounded shadow hover:bg-indigo-600">
          Upload Video
        </button>
        <button onClick={resetAnalysis} className="px-4 py-2 bg-gray-500 text-white rounded shadow hover:bg-gray-600">
          Start New Analysis
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="relative">
        <video
          ref={videoRef}
          style={{ display: useWebcam ? "none" : "block" }}
          width="640"
          height="480"
          controls={false}
          muted
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="border-4 border-gray-300 rounded"
        />
      </div>

      <div ref={reportRef} className="mt-6 w-full max-w-lg bg-white p-4 rounded shadow">
        <h4 className="text-lg font-semibold mb-2 text-red-500">⚠️ Bad Posture Alerts ({badMessages.length}):</h4>
        <ul className="max-h-48 overflow-y-auto list-disc pl-5 text-left text-gray-700">
          {badMessages.map((msg, idx) => (
            <li key={idx}>{msg}</li>
          ))}
          <div ref={messagesEndRef} />
        </ul>
      </div>

      <button
        onClick={exportPDF}
        className="mt-4 px-4 py-2 bg-yellow-500 text-white rounded shadow hover:bg-yellow-600"
      >
        Download PDF Report
      </button>
    </div>
  );
}

export default Apple;
