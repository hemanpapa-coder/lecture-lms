export interface Question {
    id: number;
    text: string;
    options: string[];
    answerIndex: number;
}

export const recordingMidtermQuestions: Question[] = [
    {
        id: 1,
        text: "다음 중 주파수(Frequency)의 단위로 올바른 것은?",
        options: ["dB (데시벨)", "Hz (헤르츠)", "W (와트)", "Ω (옴)"],
        answerIndex: 1
    },
    {
        id: 2,
        text: "일반적인 성인의 가청 주파수 대역은 어디부터 어디까지인가?",
        options: ["20Hz ~ 20kHz", "10Hz ~ 10kHz", "50Hz ~ 15kHz", "100Hz ~ 50kHz"],
        answerIndex: 0
    },
    {
        id: 3,
        text: "마이크로폰의 종류 중 팬텀 파워(48V)가 필수적인 마이크는?",
        options: ["다이내믹 마이크", "콘덴서 마이크", "리본 마이크", "카본 마이크"],
        answerIndex: 1
    },
    {
        id: 4,
        text: "소리의 세기를 나타내는 단위는 무엇인가?",
        options: ["Hz", "dB", "V", "A"],
        answerIndex: 1
    },
    {
        id: 5,
        text: "디지털 오디오에서 샘플레이트(Sample Rate) 44.1kHz가 의미하는 것은?",
        options: ["1초당 44,100번 진폭을 샘플링함", "1분에 44,100번 재생됨", "오디오 파일의 용량이 44.1KB임", "파장의 길이가 44.1m임"],
        answerIndex: 0
    }
];
