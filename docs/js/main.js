async function loadReplays() {
    try {
        const response = await fetch('replays/index.json');
        const replayList = await response.json();
        
        const container = document.getElementById('replay-list');
        container.innerHTML = ''; // Clear loading message
        
        replayList.replays.forEach(replay => {
            const replayElement = document.createElement('div');
            replayElement.className = 'replay-item';
            
            replayElement.innerHTML = `
                <h3>${replay.filename}</h3>
                <div class="replay-meta">
                    <p>Date: ${new Date(replay.timestamp).toLocaleDateString()}</p>
                    ${replay.players ? `<p>Players: ${replay.players.join(' vs ')}</p>` : ''}
                    ${replay.map ? `<p>Map: ${replay.map}</p>` : ''}
                </div>
                <a href="${replay.url}" download>Download Replay</a>
            `;
            
            container.appendChild(replayElement);
        });
    } catch (error) {
        console.error('Error loading replays:', error);
        document.getElementById('replay-list').innerHTML = 'Error loading replays.';
    }
}

// Load replays when page loads
document.addEventListener('DOMContentLoaded', loadReplays);

