import { userRequest } from '../api';
import { displayLocation } from '../composables/instance/utils';
import { extractFileId, extractFileVersion } from '../composables/shared/utils';
import { $app, API, baseClass } from './baseClass.js';

export default class extends baseClass {
    constructor(_app, _API, _t) {
        super(_app, _API, _t);
    }

    _data = {
        notyMap: []
    };

    _methods = {
        queueGameLogNoty(noty) {
            // remove join/leave notifications when switching worlds
            if (
                noty.type === 'OnPlayerJoined' ||
                noty.type === 'BlockedOnPlayerJoined' ||
                noty.type === 'MutedOnPlayerJoined'
            ) {
                var bias = this.lastLocation.date + 30 * 1000; // 30 secs
                if (Date.parse(noty.created_at) <= bias) {
                    return;
                }
            }
            if (
                noty.type === 'OnPlayerLeft' ||
                noty.type === 'BlockedOnPlayerLeft' ||
                noty.type === 'MutedOnPlayerLeft'
            ) {
                var bias = this.lastLocationDestinationTime + 5 * 1000; // 5 secs
                if (Date.parse(noty.created_at) <= bias) {
                    return;
                }
            }
            if (
                noty.type === 'Notification' ||
                noty.type === 'LocationDestination'
                // skip unused entries
            ) {
                return;
            }
            if (noty.type === 'VideoPlay') {
                if (!noty.videoName) {
                    // skip video without name
                    return;
                }
                noty.notyName = noty.videoName;
                if (noty.displayName) {
                    // add requester's name to noty
                    noty.notyName = `${noty.videoName} (${noty.displayName})`;
                }
            }
            if (
                noty.type !== 'VideoPlay' &&
                noty.displayName === API.currentUser.displayName
            ) {
                // remove current user
                return;
            }
            noty.isFriend = false;
            noty.isFavorite = false;
            if (noty.userId) {
                noty.isFriend = this.friends.has(noty.userId);
                noty.isFavorite = this.localFavoriteFriends.has(noty.userId);
            } else if (noty.displayName) {
                for (var ref of API.cachedUsers.values()) {
                    if (ref.displayName === noty.displayName) {
                        noty.isFriend = this.friends.has(ref.id);
                        noty.isFavorite = this.localFavoriteFriends.has(ref.id);
                        break;
                    }
                }
            }
            var notyFilter = this.sharedFeedFilters.noty;
            if (
                notyFilter[noty.type] &&
                (notyFilter[noty.type] === 'On' ||
                    notyFilter[noty.type] === 'Everyone' ||
                    (notyFilter[noty.type] === 'Friends' && noty.isFriend) ||
                    (notyFilter[noty.type] === 'VIP' && noty.isFavorite))
            ) {
                this.playNoty(noty);
            }
        },

        queueFeedNoty(noty) {
            if (noty.type === 'Avatar') {
                return;
            }
            // hide private worlds from feed
            if (
                this.hidePrivateFromFeed &&
                noty.type === 'GPS' &&
                noty.location === 'private'
            ) {
                return;
            }
            noty.isFriend = this.friends.has(noty.userId);
            noty.isFavorite = this.localFavoriteFriends.has(noty.userId);
            var notyFilter = this.sharedFeedFilters.noty;
            if (
                notyFilter[noty.type] &&
                (notyFilter[noty.type] === 'Everyone' ||
                    (notyFilter[noty.type] === 'Friends' && noty.isFriend) ||
                    (notyFilter[noty.type] === 'VIP' && noty.isFavorite))
            ) {
                this.playNoty(noty);
            }
        },

        queueNotificationNoty(noty) {
            noty.isFriend = this.friends.has(noty.senderUserId);
            noty.isFavorite = this.localFavoriteFriends.has(noty.senderUserId);
            var notyFilter = this.sharedFeedFilters.noty;
            if (
                notyFilter[noty.type] &&
                (notyFilter[noty.type] === 'On' ||
                    notyFilter[noty.type] === 'Friends' ||
                    (notyFilter[noty.type] === 'VIP' && noty.isFavorite))
            ) {
                this.playNoty(noty);
            }
        },

        queueFriendLogNoty(noty) {
            if (noty.type === 'FriendRequest') {
                return;
            }
            noty.isFriend = this.friends.has(noty.userId);
            noty.isFavorite = this.localFavoriteFriends.has(noty.userId);
            var notyFilter = this.sharedFeedFilters.noty;
            if (
                notyFilter[noty.type] &&
                (notyFilter[noty.type] === 'On' ||
                    notyFilter[noty.type] === 'Friends' ||
                    (notyFilter[noty.type] === 'VIP' && noty.isFavorite))
            ) {
                this.playNoty(noty);
            }
        },

        queueModerationNoty(noty) {
            noty.isFriend = false;
            noty.isFavorite = false;
            if (noty.userId) {
                noty.isFriend = this.friends.has(noty.userId);
                noty.isFavorite = this.localFavoriteFriends.has(noty.userId);
            }
            var notyFilter = this.sharedFeedFilters.noty;
            if (notyFilter[noty.type] && notyFilter[noty.type] === 'On') {
                this.playNoty(noty);
            }
        },

        playNoty(noty) {
            if (
                API.currentUser.status === 'busy' ||
                !this.friendLogInitStatus
            ) {
                return;
            }
            var displayName = '';
            if (noty.displayName) {
                displayName = noty.displayName;
            } else if (noty.senderUsername) {
                displayName = noty.senderUsername;
            } else if (noty.sourceDisplayName) {
                displayName = noty.sourceDisplayName;
            }
            if (displayName) {
                // don't play noty twice
                var notyId = `${noty.type},${displayName}`;
                if (
                    this.notyMap[notyId] &&
                    this.notyMap[notyId] >= noty.created_at
                ) {
                    return;
                }
                this.notyMap[notyId] = noty.created_at;
            }
            var bias = new Date(Date.now() - 60000).toJSON();
            if (noty.created_at < bias) {
                // don't play noty if it's over 1min old
                return;
            }

            const notiConditions = {
                Always: () => true,
                'Inside VR': () => this.isSteamVRRunning,
                'Outside VR': () => !this.isSteamVRRunning,
                'Game Closed': () => !this.isGameRunning, // Also known as "Outside VRChat"
                'Game Running': () => this.isGameRunning, // Also known as "Inside VRChat"
                'Desktop Mode': () => this.isGameNoVR && this.isGameRunning,
                AFK: () =>
                    this.afkDesktopToast &&
                    this.isHmdAfk &&
                    this.isGameRunning &&
                    !this.isGameNoVR
            };

            const playNotificationTTS =
                notiConditions[this.notificationTTS]?.();
            const playDesktopToast =
                notiConditions[this.desktopToast]?.() ||
                notiConditions['AFK']();

            const playOverlayToast = notiConditions[this.overlayToast]?.();
            const playOverlayNotification =
                this.overlayNotifications && playOverlayToast;
            const playXSNotification = this.xsNotifications && playOverlayToast;
            const playOvrtHudNotifications =
                this.ovrtHudNotifications && playOverlayToast;
            const playOvrtWristNotifications =
                this.ovrtWristNotifications && playOverlayToast;

            var message = '';
            if (noty.title) {
                message = `${noty.title}, ${noty.message}`;
            } else if (noty.message) {
                message = noty.message;
            }
            var messageList = [
                'inviteMessage',
                'requestMessage',
                'responseMessage'
            ];
            for (var k = 0; k < messageList.length; k++) {
                if (
                    typeof noty.details !== 'undefined' &&
                    typeof noty.details[messageList[k]] !== 'undefined'
                ) {
                    message = `, ${noty.details[messageList[k]]}`;
                }
            }
            if (playNotificationTTS) {
                this.playNotyTTS(noty, displayName, message);
            }
            if (
                playDesktopToast ||
                playXSNotification ||
                playOvrtHudNotifications ||
                playOvrtWristNotifications ||
                playOverlayNotification
            ) {
                if (this.imageNotifications) {
                    this.notySaveImage(noty).then((image) => {
                        if (playXSNotification) {
                            this.displayXSNotification(noty, message, image);
                        }
                        if (
                            playOvrtHudNotifications ||
                            playOvrtWristNotifications
                        ) {
                            this.displayOvrtNotification(
                                playOvrtHudNotifications,
                                playOvrtWristNotifications,
                                noty,
                                message,
                                image
                            );
                        }
                        if (playDesktopToast) {
                            this.displayDesktopToast(noty, message, image);
                        }
                        if (playOverlayNotification) {
                            this.displayOverlayNotification(
                                noty,
                                message,
                                image
                            );
                        }
                    });
                } else {
                    if (playXSNotification) {
                        this.displayXSNotification(noty, message, '');
                    }
                    if (
                        playOvrtHudNotifications ||
                        playOvrtWristNotifications
                    ) {
                        this.displayOvrtNotification(
                            playOvrtHudNotifications,
                            playOvrtWristNotifications,
                            noty,
                            message,
                            ''
                        );
                    }
                    if (playDesktopToast) {
                        this.displayDesktopToast(noty, message, '');
                    }
                    if (playOverlayNotification) {
                        this.displayOverlayNotification(noty, message, '');
                    }
                }
            }
        },

        getUserIdFromNoty(noty) {
            var userId = '';
            if (noty.userId) {
                userId = noty.userId;
            } else if (noty.senderUserId) {
                userId = noty.senderUserId;
            } else if (noty.sourceUserId) {
                userId = noty.sourceUserId;
            } else if (noty.displayName) {
                for (var ref of API.cachedUsers.values()) {
                    if (ref.displayName === noty.displayName) {
                        userId = ref.id;
                        break;
                    }
                }
            }
            return userId;
        },

        async notyGetImage(noty) {
            var imageUrl = '';
            var userId = this.getUserIdFromNoty(noty);

            if (noty.thumbnailImageUrl) {
                imageUrl = noty.thumbnailImageUrl;
            } else if (noty.details && noty.details.imageUrl) {
                imageUrl = noty.details.imageUrl;
            } else if (noty.imageUrl) {
                imageUrl = noty.imageUrl;
            } else if (userId && !userId.startsWith('grp_')) {
                imageUrl = await userRequest
                    .getCachedUser({
                        userId
                    })
                    .catch((err) => {
                        console.error(err);
                        return '';
                    })
                    .then((args) => {
                        if (!args.json) {
                            return '';
                        }
                        if (
                            this.displayVRCPlusIconsAsAvatar &&
                            args.json.userIcon
                        ) {
                            return args.json.userIcon;
                        }
                        if (args.json.profilePicOverride) {
                            return args.json.profilePicOverride;
                        }
                        return args.json.currentAvatarThumbnailImageUrl;
                    });
            }
            return imageUrl;
        },

        async notySaveImage(noty) {
            var imageUrl = await this.notyGetImage(noty);
            var fileId = extractFileId(imageUrl);
            var fileVersion = extractFileVersion(imageUrl);
            var imageLocation = '';
            try {
                if (fileId && fileVersion) {
                    imageLocation = await AppApi.GetImage(
                        imageUrl,
                        fileId,
                        fileVersion
                    );
                } else if (imageUrl) {
                    fileVersion = imageUrl.split('/').pop(); // 1416226261.thumbnail-500.png
                    fileId = fileVersion.split('.').shift(); // 1416226261
                    imageLocation = await AppApi.GetImage(
                        imageUrl,
                        fileId,
                        fileVersion
                    );
                }
            } catch (err) {
                console.error(imageUrl, err);
            }
            return imageLocation;
        },

        displayOverlayNotification(noty, message, imageFile) {
            var image = '';
            if (imageFile) {
                image = `file:///${imageFile}`;
            }
            AppApi.ExecuteVrOverlayFunction(
                'playNoty',
                JSON.stringify({ noty, message, image })
            );
        },

        async playNotyTTS(noty, displayName, message) {
            if (this.notificationTTSNickName) {
                var userId = this.getUserIdFromNoty(noty);
                var memo = await $app.getUserMemo(userId);
                if (memo.memo) {
                    var array = memo.memo.split('\n');
                    var nickName = array[0];
                    displayName = nickName;
                }
            }
            switch (noty.type) {
                case 'OnPlayerJoined':
                    this.speak(`${displayName} has joined`);
                    break;
                case 'OnPlayerLeft':
                    this.speak(`${displayName} has left`);
                    break;
                case 'OnPlayerJoining':
                    this.speak(`${displayName} is joining`);
                    break;
                case 'GPS':
                    this.speak(
                        `${displayName} is in ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`
                    );
                    break;
                case 'Online':
                    var locationName = '';
                    if (noty.worldName) {
                        locationName = ` to ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`;
                    }
                    this.speak(`${displayName} has logged in${locationName}`);
                    break;
                case 'Offline':
                    this.speak(`${displayName} has logged out`);
                    break;
                case 'Status':
                    this.speak(
                        `${displayName} status is now ${noty.status} ${noty.statusDescription}`
                    );
                    break;
                case 'invite':
                    this.speak(
                        `${displayName} has invited you to ${displayLocation(
                            noty.details.worldId,
                            noty.details.worldName,
                            noty.groupName
                        )}${message}`
                    );
                    break;
                case 'requestInvite':
                    this.speak(
                        `${displayName} has requested an invite${message}`
                    );
                    break;
                case 'inviteResponse':
                    this.speak(
                        `${displayName} has responded to your invite${message}`
                    );
                    break;
                case 'requestInviteResponse':
                    this.speak(
                        `${displayName} has responded to your invite request${message}`
                    );
                    break;
                case 'friendRequest':
                    this.speak(`${displayName} has sent you a friend request`);
                    break;
                case 'Friend':
                    this.speak(`${displayName} is now your friend`);
                    break;
                case 'Unfriend':
                    this.speak(`${displayName} is no longer your friend`);
                    break;
                case 'TrustLevel':
                    this.speak(
                        `${displayName} trust level is now ${noty.trustLevel}`
                    );
                    break;
                case 'DisplayName':
                    this.speak(
                        `${noty.previousDisplayName} changed their name to ${noty.displayName}`
                    );
                    break;
                case 'boop':
                    this.speak(noty.message);
                    break;
                case 'groupChange':
                    this.speak(`${displayName} ${noty.message}`);
                    break;
                case 'group.announcement':
                    this.speak(noty.message);
                    break;
                case 'group.informative':
                    this.speak(noty.message);
                    break;
                case 'group.invite':
                    this.speak(noty.message);
                    break;
                case 'group.joinRequest':
                    this.speak(noty.message);
                    break;
                case 'group.transfer':
                    this.speak(noty.message);
                    break;
                case 'group.queueReady':
                    this.speak(noty.message);
                    break;
                case 'instance.closed':
                    this.speak(noty.message);
                    break;
                case 'PortalSpawn':
                    if (displayName) {
                        this.speak(
                            `${displayName} has spawned a portal to ${displayLocation(
                                noty.instanceId,
                                noty.worldName,
                                noty.groupName
                            )}`
                        );
                    } else {
                        this.speak('User has spawned a portal');
                    }
                    break;
                case 'AvatarChange':
                    this.speak(
                        `${displayName} changed into avatar ${noty.name}`
                    );
                    break;
                case 'ChatBoxMessage':
                    this.speak(`${displayName} said ${noty.text}`);
                    break;
                case 'Event':
                    this.speak(noty.data);
                    break;
                case 'External':
                    this.speak(noty.message);
                    break;
                case 'VideoPlay':
                    this.speak(`Now playing: ${noty.notyName}`);
                    break;
                case 'BlockedOnPlayerJoined':
                    this.speak(`Blocked user ${displayName} has joined`);
                    break;
                case 'BlockedOnPlayerLeft':
                    this.speak(`Blocked user ${displayName} has left`);
                    break;
                case 'MutedOnPlayerJoined':
                    this.speak(`Muted user ${displayName} has joined`);
                    break;
                case 'MutedOnPlayerLeft':
                    this.speak(`Muted user ${displayName} has left`);
                    break;
                case 'Blocked':
                    this.speak(`${displayName} has blocked you`);
                    break;
                case 'Unblocked':
                    this.speak(`${displayName} has unblocked you`);
                    break;
                case 'Muted':
                    this.speak(`${displayName} has muted you`);
                    break;
                case 'Unmuted':
                    this.speak(`${displayName} has unmuted you`);
                    break;
            }
        },

        displayXSNotification(noty, message, image) {
            const timeout = Math.floor(
                parseInt(this.notificationTimeout, 10) / 1000
            );
            const opacity = parseFloat(this.notificationOpacity) / 100;
            switch (noty.type) {
                case 'OnPlayerJoined':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has joined`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'OnPlayerLeft':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has left`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'OnPlayerJoining':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} is joining`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'GPS':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} is in ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Online':
                    var locationName = '';
                    if (noty.worldName) {
                        locationName = ` to ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`;
                    }
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has logged in${locationName}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Offline':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has logged out`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Status':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} status is now ${noty.status} ${noty.statusDescription}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'invite':
                    AppApi.XSNotification(
                        'VRCX',
                        `${
                            noty.senderUsername
                        } has invited you to ${displayLocation(
                            noty.details.worldId,
                            noty.details.worldName
                        )}${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'requestInvite':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.senderUsername} has requested an invite${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'inviteResponse':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.senderUsername} has responded to your invite${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'requestInviteResponse':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.senderUsername} has responded to your invite request${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'friendRequest':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.senderUsername} has sent you a friend request`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Friend':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} is now your friend`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Unfriend':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} is no longer your friend`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'TrustLevel':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} trust level is now ${noty.trustLevel}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'DisplayName':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.previousDisplayName} changed their name to ${noty.displayName}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'boop':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'groupChange':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.senderUsername}: ${noty.message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.announcement':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.informative':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.invite':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.joinRequest':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.transfer':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.queueReady':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'instance.closed':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'PortalSpawn':
                    if (noty.displayName) {
                        AppApi.XSNotification(
                            'VRCX',
                            `${
                                noty.displayName
                            } has spawned a portal to ${displayLocation(
                                noty.instanceId,
                                noty.worldName,
                                noty.groupName
                            )}`,
                            timeout,
                            opacity,
                            image
                        );
                    } else {
                        AppApi.XSNotification(
                            'VRCX',
                            'User has spawned a portal',
                            timeout,
                            opacity,
                            image
                        );
                    }
                    break;
                case 'AvatarChange':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} changed into avatar ${noty.name}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'ChatBoxMessage':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} said ${noty.text}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Event':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.data,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'External':
                    AppApi.XSNotification(
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'VideoPlay':
                    AppApi.XSNotification(
                        'VRCX',
                        `Now playing: ${noty.notyName}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'BlockedOnPlayerJoined':
                    AppApi.XSNotification(
                        'VRCX',
                        `Blocked user ${noty.displayName} has joined`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'BlockedOnPlayerLeft':
                    AppApi.XSNotification(
                        'VRCX',
                        `Blocked user ${noty.displayName} has left`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'MutedOnPlayerJoined':
                    AppApi.XSNotification(
                        'VRCX',
                        `Muted user ${noty.displayName} has joined`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'MutedOnPlayerLeft':
                    AppApi.XSNotification(
                        'VRCX',
                        `Muted user ${noty.displayName} has left`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Blocked':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has blocked you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Unblocked':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has unblocked you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Muted':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has muted you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Unmuted':
                    AppApi.XSNotification(
                        'VRCX',
                        `${noty.displayName} has unmuted you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
            }
        },

        displayOvrtNotification(
            playOvrtHudNotifications,
            playOvrtWristNotifications,
            noty,
            message,
            image
        ) {
            const timeout = Math.floor(
                parseInt(this.notificationTimeout, 10) / 1000
            );
            const opacity = parseFloat(this.notificationOpacity) / 100;
            switch (noty.type) {
                case 'OnPlayerJoined':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has joined`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'OnPlayerLeft':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has left`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'OnPlayerJoining':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} is joining`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'GPS':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} is in ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Online':
                    var locationName = '';
                    if (noty.worldName) {
                        locationName = ` to ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`;
                    }
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has logged in${locationName}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Offline':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has logged out`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Status':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} status is now ${noty.status} ${noty.statusDescription}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'invite':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${
                            noty.senderUsername
                        } has invited you to ${displayLocation(
                            noty.details.worldId,
                            noty.details.worldName
                        )}${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'requestInvite':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.senderUsername} has requested an invite${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'inviteResponse':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.senderUsername} has responded to your invite${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'requestInviteResponse':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.senderUsername} has responded to your invite request${message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'friendRequest':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.senderUsername} has sent you a friend request`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Friend':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} is now your friend`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Unfriend':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} is no longer your friend`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'TrustLevel':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} trust level is now ${noty.trustLevel}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'DisplayName':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.previousDisplayName} changed their name to ${noty.displayName}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'boop':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'groupChange':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.senderUsername}: ${noty.message}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.announcement':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.informative':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.invite':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.joinRequest':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.transfer':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'group.queueReady':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'instance.closed':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'PortalSpawn':
                    if (noty.displayName) {
                        AppApi.OVRTNotification(
                            playOvrtHudNotifications,
                            playOvrtWristNotifications,
                            'VRCX',
                            `${
                                noty.displayName
                            } has spawned a portal to ${displayLocation(
                                noty.instanceId,
                                noty.worldName,
                                noty.groupName
                            )}`,
                            timeout,
                            opacity,
                            image
                        );
                    } else {
                        AppApi.OVRTNotification(
                            playOvrtHudNotifications,
                            playOvrtWristNotifications,
                            'VRCX',
                            'User has spawned a portal',
                            timeout,
                            opacity,
                            image
                        );
                    }
                    break;
                case 'AvatarChange':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} changed into avatar ${noty.name}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'ChatBoxMessage':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} said ${noty.text}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Event':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.data,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'External':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        noty.message,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'VideoPlay':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `Now playing: ${noty.notyName}`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'BlockedOnPlayerJoined':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `Blocked user ${noty.displayName} has joined`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'BlockedOnPlayerLeft':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `Blocked user ${noty.displayName} has left`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'MutedOnPlayerJoined':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `Muted user ${noty.displayName} has joined`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'MutedOnPlayerLeft':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `Muted user ${noty.displayName} has left`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Blocked':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has blocked you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Unblocked':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has unblocked you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Muted':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has muted you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
                case 'Unmuted':
                    AppApi.OVRTNotification(
                        playOvrtHudNotifications,
                        playOvrtWristNotifications,
                        'VRCX',
                        `${noty.displayName} has unmuted you`,
                        timeout,
                        opacity,
                        image
                    );
                    break;
            }
        },

        desktopNotification(displayName, message, image) {
            if (WINDOWS) {
                AppApi.DesktopNotification(displayName, message, image);
            } else {
                window.electron.desktopNotification(
                    displayName,
                    message,
                    image
                );
            }
        },

        displayDesktopToast(noty, message, image) {
            switch (noty.type) {
                case 'OnPlayerJoined':
                    this.desktopNotification(
                        noty.displayName,
                        'has joined',
                        image
                    );
                    break;
                case 'OnPlayerLeft':
                    this.desktopNotification(
                        noty.displayName,
                        'has left',
                        image
                    );
                    break;
                case 'OnPlayerJoining':
                    this.desktopNotification(
                        noty.displayName,
                        'is joining',
                        image
                    );
                    break;
                case 'GPS':
                    this.desktopNotification(
                        noty.displayName,
                        `is in ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`,
                        image
                    );
                    break;
                case 'Online':
                    var locationName = '';
                    if (noty.worldName) {
                        locationName = ` to ${displayLocation(
                            noty.location,
                            noty.worldName,
                            noty.groupName
                        )}`;
                    }
                    this.desktopNotification(
                        noty.displayName,
                        `has logged in${locationName}`,
                        image
                    );
                    break;
                case 'Offline':
                    this.desktopNotification(
                        noty.displayName,
                        'has logged out',
                        image
                    );
                    break;
                case 'Status':
                    this.desktopNotification(
                        noty.displayName,
                        `status is now ${noty.status} ${noty.statusDescription}`,
                        image
                    );
                    break;
                case 'invite':
                    this.desktopNotification(
                        noty.senderUsername,
                        `has invited you to ${displayLocation(
                            noty.details.worldId,
                            noty.details.worldName
                        )}${message}`,
                        image
                    );
                    break;
                case 'requestInvite':
                    this.desktopNotification(
                        noty.senderUsername,
                        `has requested an invite${message}`,
                        image
                    );
                    break;
                case 'inviteResponse':
                    this.desktopNotification(
                        noty.senderUsername,
                        `has responded to your invite${message}`,
                        image
                    );
                    break;
                case 'requestInviteResponse':
                    this.desktopNotification(
                        noty.senderUsername,
                        `has responded to your invite request${message}`,
                        image
                    );
                    break;
                case 'friendRequest':
                    this.desktopNotification(
                        noty.senderUsername,
                        'has sent you a friend request',
                        image
                    );
                    break;
                case 'Friend':
                    this.desktopNotification(
                        noty.displayName,
                        'is now your friend',
                        image
                    );
                    break;
                case 'Unfriend':
                    this.desktopNotification(
                        noty.displayName,
                        'is no longer your friend',
                        image
                    );
                    break;
                case 'TrustLevel':
                    this.desktopNotification(
                        noty.displayName,
                        `trust level is now ${noty.trustLevel}`,
                        image
                    );
                    break;
                case 'DisplayName':
                    this.desktopNotification(
                        noty.previousDisplayName,
                        `changed their name to ${noty.displayName}`,
                        image
                    );
                    break;
                case 'boop':
                    this.desktopNotification(
                        noty.senderUsername,
                        noty.message,
                        image
                    );
                    break;
                case 'groupChange':
                    this.desktopNotification(
                        noty.senderUsername,
                        noty.message,
                        image
                    );
                    break;
                case 'group.announcement':
                    this.desktopNotification(
                        'Group Announcement',
                        noty.message,
                        image
                    );
                    break;
                case 'group.informative':
                    this.desktopNotification(
                        'Group Informative',
                        noty.message,
                        image
                    );
                    break;
                case 'group.invite':
                    this.desktopNotification(
                        'Group Invite',
                        noty.message,
                        image
                    );
                    break;
                case 'group.joinRequest':
                    this.desktopNotification(
                        'Group Join Request',
                        noty.message,
                        image
                    );
                    break;
                case 'group.transfer':
                    this.desktopNotification(
                        'Group Transfer Request',
                        noty.message,
                        image
                    );
                    break;
                case 'group.queueReady':
                    this.desktopNotification(
                        'Instance Queue Ready',
                        noty.message,
                        image
                    );
                    break;
                case 'instance.closed':
                    this.desktopNotification(
                        'Instance Closed',
                        noty.message,
                        image
                    );
                    break;
                case 'PortalSpawn':
                    if (noty.displayName) {
                        this.desktopNotification(
                            noty.displayName,
                            `has spawned a portal to ${displayLocation(
                                noty.instanceId,
                                noty.worldName,
                                noty.groupName
                            )}`,
                            image
                        );
                    } else {
                        this.desktopNotification(
                            '',
                            'User has spawned a portal',
                            image
                        );
                    }
                    break;
                case 'AvatarChange':
                    this.desktopNotification(
                        noty.displayName,
                        `changed into avatar ${noty.name}`,
                        image
                    );
                    break;
                case 'ChatBoxMessage':
                    this.desktopNotification(
                        noty.displayName,
                        `said ${noty.text}`,
                        image
                    );
                    break;
                case 'Event':
                    this.desktopNotification('Event', noty.data, image);
                    break;
                case 'External':
                    this.desktopNotification('External', noty.message, image);
                    break;
                case 'VideoPlay':
                    this.desktopNotification(
                        'Now playing',
                        noty.notyName,
                        image
                    );
                    break;
                case 'BlockedOnPlayerJoined':
                    this.desktopNotification(
                        noty.displayName,
                        'blocked user has joined',
                        image
                    );
                    break;
                case 'BlockedOnPlayerLeft':
                    this.desktopNotification(
                        noty.displayName,
                        'blocked user has left',
                        image
                    );
                    break;
                case 'MutedOnPlayerJoined':
                    this.desktopNotification(
                        noty.displayName,
                        'muted user has joined',
                        image
                    );
                    break;
                case 'MutedOnPlayerLeft':
                    this.desktopNotification(
                        noty.displayName,
                        'muted user has left',
                        image
                    );
                    break;
                case 'Blocked':
                    this.desktopNotification(
                        noty.displayName,
                        'has blocked you',
                        image
                    );
                    break;
                case 'Unblocked':
                    this.desktopNotification(
                        noty.displayName,
                        'has unblocked you',
                        image
                    );
                    break;
                case 'Muted':
                    this.desktopNotification(
                        noty.displayName,
                        'has muted you',
                        image
                    );
                    break;
                case 'Unmuted':
                    this.desktopNotification(
                        noty.displayName,
                        'has unmuted you',
                        image
                    );
                    break;
            }
        }
    };
}
