<?php

namespace App\Http\Controllers;

use Agence104\LiveKit\AccessToken;
use Agence104\LiveKit\AccessTokenOptions;
use Agence104\LiveKit\VideoGrant;
use App\Models\Auction;
use Illuminate\Support\Facades\Auth;

class LiveKitTokenController extends Controller
{
    /**
     * LiveKit erişim token'ı üretir.
     * Yayıncı (ilan sahibi) = publish; izleyici = yalnızca subscribe.
     * API SECRET yalnızca burada (sunucuda) kullanılır.
     */
    public function token(Auction $auction)
    {
        $user = Auth::user();
        abort_unless($user, 401);

        $isBroadcaster = (int) $auction->user_id === (int) $user->id;
        $room = 'auction-' . $auction->id;

        $grant = (new VideoGrant())
            ->setRoomJoin(true)
            ->setRoomName($room)
            ->setCanPublish($isBroadcaster)
            ->setCanSubscribe(true)
            ->setCanPublishData(true);

        $options = (new AccessTokenOptions())
            ->setIdentity('u' . $user->id)
            ->setName($user->name)
            ->setMetadata(json_encode([
                'role'   => $isBroadcaster ? 'broadcaster' : 'viewer',
                'name'   => $user->name,
                'avatar' => $user->profile_img ?? null,
            ]))
            ->setTtl(3600);

        $jwt = (new AccessToken(config('services.livekit.key'), config('services.livekit.secret')))
            ->init($options)
            ->setGrant($grant)
            ->toJwt();

        return response()->json([
            'token'    => $jwt,
            'url'      => config('services.livekit.url'),
            'room'     => $room,
            'identity' => 'u' . $user->id,
            'role'     => $isBroadcaster ? 'broadcaster' : 'viewer',
        ]);
    }
}
