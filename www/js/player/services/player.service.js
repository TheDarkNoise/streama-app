'use strict';

angular.module('streama.player').factory('playerService',
  function ($stateParams, $sce, $state, $rootScope, websocketService, apiService, $interval, $filter) {

    var videoData = null;
    var videoOptions;

    return {
      viewingStatusSaveInterval: null,
      setVideoOptions: setVideoOptions,
      onVideoPlay: onVideoPlay,
      onVideoPause: onVideoPause,
      onVideoClose: onVideoClose,
      onVideoError: onVideoError,
      onVideoTimeChange: onVideoTimeChange,
      onSocketSessionCreate: onSocketSessionCreate,
      handleMissingFileError: handleMissingFileError,
      handleWrongBasepathError: handleWrongBasepathError,
      registerSocketListener: registerSocketListener,
      destroyPlayer: destroyPlayer,
      handleSocketEvent: handleSocketEvent,
      onNext: onNext,
      onVideoClick: onVideoClick
    };

    /**
     *
     * @param video
     * @returns {{}}
     */
    function setVideoOptions(video, episodes) {

      var videoOptions = {};

      videoOptions.videoSrc = _.get(video, 'files[0].src');
      videoOptions.isExternalLink = true;
      videoOptions.videoMetaTitle = _.get(video, 'title') || _.get(video, 'episodeString') + ' ' + _.get(video, 'name');
      videoOptions.episodeList = _.groupBy(episodes, 'season_number');

      videoOptions.showEpisodeBrowser = true;
      videoOptions.currentEpisode = {
        episode: 1,
        season: 1,
        id: 1
      };
      videoOptions.subtitles = [
        {"id": 1561, "src": "/example/sub-de.vtt", "subtitleLabel": "Deutsch", "subtitleSrcLang": "de", "contentType": "application/x-subrip"},
        {"id": 1562, "src": "/example/sub-en.vtt", "subtitleLabel": "English", "subtitleSrcLang": "en", "contentType": "application/x-subrip"}
      ];

      videoOptions.currentSubtitle = 1562;
      videoOptions.onPlay = this.onVideoPlay.bind(videoOptions);
      videoOptions.onError = this.onVideoError.bind(videoOptions);


      console.log('%c videoOptions', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;', videoOptions);
      videoData = video;
      return videoOptions;


      videoOptions.videoSrc = $sce.trustAsResourceUrl(video.files[0].src || video.files[0].externalLink);
      videoOptions.videoType = video.files[0].contentType;

      if(video.subtitles && video.subtitles.length){
        videoOptions.videoTrack = $sce.trustAsResourceUrl(video.subtitles[0].src);
      }

      videoOptions.videoMetaTitle = (video.show ? video.show.name : video.title);
      videoOptions.videoMetaSubtitle = (video.show ? video.episodeString + ' - ' + video.name : (video.release_date ? video.release_date.substring(0, 4) : ''));
      videoOptions.videoMetaDescription = video.overview;

      if(videoData.nextEpisode){
        console.log('%c showNextButton', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');
        videoOptions.showNextButton = true;
      }

      if(videoData.show){
        videoOptions.showEpisodeBrowser = true;

        apiService.tvShow.episodesForTvShow(videoData.show.id).success(function (episodes) {
          videoOptions.episodeList = _.groupBy(episodes, 'season_number');
          videoOptions.selectedEpisodes = videoOptions.episodeList[videoData.season_number];
          videoOptions.currentEpisode = {
            episode: videoData.episode_number,
            season: videoData.season_number,
            intro_start: videoData.intro_start,
            intro_end: videoData.intro_end,
            outro_start: videoData.outro_start
          };
        });
      }

      if($stateParams.currentTime){
        videoOptions.customStartingTime = $stateParams.currentTime;
      }
      else if(video.viewedStatus){
        videoOptions.customStartingTime = video.viewedStatus.currentPlayTime;
      }else{
        videoOptions.customStartingTime = 0;
      }

      videoOptions.onPlay = this.onVideoPlay.bind(videoOptions);
      videoOptions.onPause = this.onVideoPause.bind(videoOptions);
      videoOptions.onError = this.onVideoError.bind(videoOptions);
      videoOptions.onTimeChange = this.onVideoTimeChange.bind(videoOptions);
      videoOptions.onClose = this.onVideoClose.bind(videoOptions);
      videoOptions.onNext = this.onNext.bind(videoOptions);
      videoOptions.onVideoClick = this.onVideoClick.bind(videoOptions);
      videoOptions.onSocketSessionCreate = this.onSocketSessionCreate.bind(videoOptions);

      return videoOptions;
    }


    /**
     *
     * @param videoElement
     * @param socketData
     */
    function onVideoPlay(videoElement, socketData) {
      var that = this;
      console.log('%c onVideoPlay', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');

      that.viewingStatusSaveInterval = $interval(function() {
        var params = {videoId: videoData.id, currentTime: videoElement.currentTime, runtime: videoElement.duration};

        if(params.runtime && params.videoId){
          apiService.player.updateViewingStatus(params);
        }
      }, 5000);


      if($stateParams.sessionId && !socketData){
        console.log('%c send socket event PLAY', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');
        apiService.websocket.triggerPlayerAction({socketSessionId: $stateParams.sessionId, playerAction: 'play', currentPlayerTime: videoElement.currentTime});
      }
    }


    /**
     *
     * @param videoElement
     * @param socketData
     */
    function onVideoPause(videoElement, socketData) {
      console.log('%c onVideoPause', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;', socketData);
      var that = this;
      $interval.cancel(that.viewingStatusSaveInterval);

      if($stateParams.sessionId && socketData){
        if(videoElement.currentTime+1.5 > socketData.currentPlayerTime || videoElement.currentTime-1.5 < socketData.currentPlayerTime){
          videoElement.currentTime = socketData.currentPlayerTime;
        }
      }


      if($stateParams.sessionId && !socketData){
        console.log('%c send socket event PAUSE', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');
        apiService.websocket.triggerPlayerAction({socketSessionId: $stateParams.sessionId, playerAction: 'pause', currentPlayerTime: videoElement.currentTime});
      }
    }

    /**
     *
     */
    function onVideoClose() {
      console.log('%c onVideoClose', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');
      var that = this;
      $state.go('dash', {});
    }


    /**
     *
     * @param errorCode
     */
    function onVideoError(errorCode) {
      var that = this;
      errorCode = errorCode || 'CODEC_PROBLEM';
      console.log('%c onVideoError', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');

      if($state.current.name == 'player'){
        alertify.alert($filter('translate')('MESSAGES.' + errorCode), function () {
          $state.go('main.dash', {})
        });
      }
    }


    /**
     *
     * @param slider
     * @param duration
     */
    function onVideoTimeChange(slider, duration) {
      var params = {videoId: videoData.id, currentTime: slider.value, runtime: duration};
      apiService.player.updateViewingStatus(params);


      if($stateParams.sessionId){
        apiService.websocket.triggerPlayerAction({socketSessionId: $stateParams.sessionId, playerAction: 'timeChange', currentPlayerTime: slider.value});
      }
    }


    /**
     *
     */
    function onSocketSessionCreate() {
      alertify.set({ buttonReverse: true, labels: {ok: "OK", cancel : "Cancel"}});
      alertify.confirm($filter('translate')('MESSAGES.SHARE_SOCKET'), function (confirmed) {
        if(confirmed){
          $stateParams.sessionId = websocketService.getUUID();
          $state.go($state.current, $stateParams, {reload: true});
        }
      });
    }


    /**
     *
     * @param video
     * @returns {boolean}
     */
    function handleMissingFileError(video) {
      var hasError = false;

      if(!video.files || !video.files.length){
        hasError = true;
        alertify.alert($filter('translate')('MESSAGES.FILE_MISSING'), function () {
          $state.go('main.dash', {})
        });
      }

      return hasError;
    }


    /**
     *
     * @param video
     * @returns {boolean}
     */
    function handleWrongBasepathError(video) {
      var hasError = false;
      var videoSource = _.get(video, 'files[0].src');
      var externalLink = _.get(video, 'files[0].externalLink');
      var basePath = apiService.getBasePath();

      if(videoSource && videoSource.indexOf(basePath) == -1 && !externalLink){
        hasError = true;
        alertify.alert($filter('translate')('MESSAGES.WRONG_BASEPATH', {basePath: basePath}), function () {
          $state.go('main.dash', {})
        });
      }
      return hasError;
    }


    /**
     *
     */
    function destroyPlayer() {
      console.log('%c $stateChangeSuccess', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');
      var that = this;
      $interval.cancel(that.viewingStatusSaveInterval);
      websocketService.unsubscribe();
    }


    /**
     *
     * @param data
     */
    function handleSocketEvent(data) {
      if(data.browserSocketUUID != websocketService.browserSocketUUID){
        console.log('%c handleSocketEvent', 'color: deeppink; font-weight: bold; text-shadow: 0 0 5px deeppink;');
        switch (data.playerAction){
          case 'play':
            $rootScope.$broadcast('triggerVideoPlay', data);
            break;
          case 'pause':
            $rootScope.$broadcast('triggerVideoPause', data);
            break;
          case 'timeChange':
            $rootScope.$broadcast('triggerVideoTimeChange', data);
            break;
        }
      }
    }


    /**
     *
     */
    function registerSocketListener() {
      if($stateParams.sessionId){
        websocketService.registerPlayerSessonListener($stateParams.sessionId);
      }
    }


    /**
     *
     */
    function onNext() {
      $state.go('player', {videoId: videoData.nextEpisode.id});
    }

    /**
     *
     */
    function onVideoClick() {
      if($rootScope.currentUser.pauseVideoOnClick){
        $rootScope.$broadcast('triggerVideoToggle');
      }
    }
});
