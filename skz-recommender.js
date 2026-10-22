let allTracks = [];
const statusText = document.getElementById("status");
const form = document.getElementById("recommenderForm");
const resultDiv = document.getElementById("result");
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioContext;

function normalizeMediaLoudness(mediaElement) {
  if (!AudioContextClass) {
    console.error(
      "AudioContext is unavailable; preview loudness cannot be normalized.",
    );
    return;
  }

  try {
    audioContext ||= new AudioContextClass();
    audioContext.resume().catch((error) => {
      console.error("Could not start preview loudness normalization.", error);
    });
    const source = audioContext.createMediaElementSource(mediaElement);
    const analyser = audioContext.createAnalyser();
    const gain = audioContext.createGain();
    const compressor = audioContext.createDynamicsCompressor();
    analyser.fftSize = 2048;
    const samples = new Float32Array(analyser.fftSize);
    compressor.threshold.value = -6;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(compressor);
    compressor.connect(audioContext.destination);

    let levelFrame = null;
    const adjustLoudness = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(
        samples.reduce((sum, sample) => sum + sample * sample, 0) /
          samples.length,
      );

      if (rms > 0.003) {
        const targetGain = Math.min(
          4,
          Math.max(0.25, (0.12 * mediaElement.volume) / rms),
        );
        gain.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.25);
      }
      levelFrame = requestAnimationFrame(adjustLoudness);
    };

    mediaElement.addEventListener("play", () => {
      audioContext.resume().catch((error) => {
        console.error("Could not start preview loudness normalization.", error);
      });
      if (levelFrame === null) {
        levelFrame = requestAnimationFrame(adjustLoudness);
      }
    });

    const stopAdjusting = () => {
      if (levelFrame !== null) {
        cancelAnimationFrame(levelFrame);
        levelFrame = null;
      }
    };
    mediaElement.addEventListener("pause", stopAdjusting);
    mediaElement.addEventListener("ended", stopAdjusting);
  } catch (error) {
    console.error("Could not set up preview loudness normalization.", error);
  }
}

function getTrackGenre(track) {
  return track.primaryGenreName;
}

function getTrackSubGenre(track) {
  return track.genre;
}

function getTrackDescription(track) {
  return track.description || "";
}
// Load the checked-in catalog so recommendations do not depend on iTunes availability.
fetch("skz-recommender.json")
  .then((res) => {
    if (!res.ok) throw new Error("Could not load the local music catalog.");
    return res.json();
  })
  .then((data) => {
    if (!Array.isArray(data.tracks)) {
      throw new Error("The local music catalog has an invalid format.");
    }
    allTracks = data.tracks;

    statusText.style.display = "none";
    form.style.display = "block";
  })
  .catch((err) => {
    statusText.innerText = "Error loading the local music catalog.";
    console.error(err);
  });

// 2. Handle the user option submission
form.addEventListener("submit", function (e) {
  e.preventDefault();

  const selectedGenre = document.getElementById("genreSelect").value;
  const requiresMV = document.getElementById("mvSelect").value;

  // 3. Filter data locally
  let filtered = allTracks.filter((track) => {
    const matchesGenre = getTrackGenre(track) === selectedGenre;

    if (requiresMV === "yes") {
      return matchesGenre && track.hasMV;
    }
    if (requiresMV === "no") {
      return matchesGenre && !track.hasMV;
    }
    return matchesGenre;
  });

  // 4. Render recommendations
  if (filtered.length === 0) {
    resultDiv.innerHTML =
      "<p>No exact match found. Try changing your dropdown options!</p>";
  } else {
    // Grab a random track out of the filtered arrays
    const randomTrack = filtered[Math.floor(Math.random() * filtered.length)];
    const mediaPreview = randomTrack.hasMV
      ? `<video controls playsinline crossorigin="anonymous" src="${randomTrack.MVpreviewUrl}"></video>`
      : `<img class="artwork" src="${randomTrack.artworkUrl100}" alt="Album Art">
         <audio controls crossorigin="anonymous" src="${randomTrack.previewUrl}"></audio>`;

    resultDiv.innerHTML = `
      <h3>Your Recommendation:</h3>
      ${mediaPreview}
      <h4>${randomTrack.trackName}</h4>
      <p><strong>Album:</strong> ${randomTrack.collectionName}</p>
      <p><strong>Genre:</strong> ${getTrackGenre(randomTrack)}</p>
      <p><strong>Sub-Genre:</strong> ${getTrackSubGenre(randomTrack)}</p>

     
    `;
    normalizeMediaLoudness(resultDiv.querySelector("audio, video"));
  }
  resultDiv.style.display = "block";
});
