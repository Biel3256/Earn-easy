import gameBattleshipSoloImg from '../assets/images/game_battleship_solo_1795250044757.jpg';
import gameBlockBritzImg from '../assets/images/game_blockbritz_icon_1795248904777.jpg';
import gameCardsImg from '../assets/images/game_cards_icon_1795186544220.jpg';
import gameConnect4SoloImg from '../assets/images/game_connect4_solo_1795250045692.jpg';
import gameDominoSoloImg from '../assets/images/game_domino_solo_1795250041011.jpg';
import gameDotLinkImg from '../assets/images/game_dotlink_icon_1795186545139.jpg';
import gameDrawGuessSoloImg from '../assets/images/game_draw_guess_solo_1795250046182.jpg';
import gameGuessNumberSoloImg from '../assets/images/game_guess_number_solo_1795250045923.jpg';
import gameMathImg from '../assets/images/game_math_icon_1795186543447.jpg';
import gameMemoryImg from '../assets/images/game_memory_icon_1795186544976.jpg';
import gameQuizSoloImg from '../assets/images/game_quiz_solo_1795250045668.jpg';
import gameReflexImg from '../assets/images/game_reflex_icon_1795186544995.jpg';
import gameRpsSoloImg from '../assets/images/game_rps_solo_1795250046341.jpg';
import gameStopSoloImg from '../assets/images/game_stop_solo_1795250042532.jpg';
import gameTicTacToeImg from '../assets/images/game_tictactoe_icon_1795186544275.jpg';
import gameWordSearchImg from '../assets/images/game_wordsearch_icon_1795186544984.jpg';
import heroGamingBannerImg from '../assets/images/hero_gaming_banner_1795186544377.jpg';
import { GameCategory } from '../types/earneasy';

export { heroGamingBannerImg };

export const GAME_THUMBNAILS: Record<GameCategory, string> = {
  tic_tac_toe: gameTicTacToeImg,
  word_search: gameWordSearchImg,
  dot_link: gameDotLinkImg,
  math_sprint: gameMathImg,
  memory_match: gameMemoryImg,
  quick_reflex: gameReflexImg,
  high_low_cards: gameCardsImg,
  block_britz: gameBlockBritzImg,
  domino_solo: gameDominoSoloImg,
  stop_solo: gameStopSoloImg,
  draw_guess_solo: gameDrawGuessSoloImg,
  battleship_solo: gameBattleshipSoloImg,
  connect4_solo: gameConnect4SoloImg,
  quiz_solo: gameQuizSoloImg,
  rps_solo: gameRpsSoloImg,
  guess_number_solo: gameGuessNumberSoloImg,
};
