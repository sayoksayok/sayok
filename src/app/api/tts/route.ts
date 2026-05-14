import { NextRequest, NextResponse } from 'next/server';

// ElevenLabs voices optimized for each language
// Using specific voices that work better with certain languages
const getVoiceForLanguage = (lang: string): { voiceId: string; modelId: string } => {
  switch (lang) {
    case 'ja':
      // Japanese - use multilingual with Aria (better for Asian languages)
      return { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', modelId: 'eleven_multilingual_v2' };
    case 'ko':
      // Korean - use multilingual with Aria
      return { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', modelId: 'eleven_multilingual_v2' };
    case 'zh-CN':
    case 'zh-TW':
      // Chinese - use multilingual with Aria
      return { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', modelId: 'eleven_multilingual_v2' };
    case 'th':
      // Thai - use multilingual with Aria
      return { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', modelId: 'eleven_multilingual_v2' };
    case 'vi':
      // Vietnamese - use multilingual with Aria
      return { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', modelId: 'eleven_multilingual_v2' };
    case 'es':
      // Spanish - use Rachel multilingual
      return { voiceId: '21m00Tcm4TlvDq8ikWAM', modelId: 'eleven_multilingual_v2' };
    case 'fr':
      // French - use Rachel multilingual
      return { voiceId: '21m00Tcm4TlvDq8ikWAM', modelId: 'eleven_multilingual_v2' };
    case 'en':
    default:
      // English - use Rachel (best for English)
      return { voiceId: '21m00Tcm4TlvDq8ikWAM', modelId: 'eleven_multilingual_v2' };
  }
};

export async function POST(request: NextRequest) {
  try {
    const { text, targetLang } = await request.json();

    if (!text || !targetLang) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      console.log('No ElevenLabs API key found');
      return NextResponse.json(
        { useBrowserTTS: true },
        { status: 200 }
      );
    }

    const { voiceId, modelId } = getVoiceForLanguage(targetLang);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: modelId,
          output_format: 'mp3_44100_128',
          voice_settings: {
            stability: 0.65,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs TTS error:', response.status, errorText);
      return NextResponse.json(
        { useBrowserTTS: true },
        { status: 200 }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({
      audioContent: base64Audio
    });

  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      { useBrowserTTS: true },
      { status: 200 }
    );
  }
}
