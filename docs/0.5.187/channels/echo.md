# Echo
This channel sends users real-time "echo" information on objects in scope. It has been built for channel implementers to have a simple channel implementation to use as a starting point.

## What for
It's a reference implementation of a Kwirth channel, and although that is its main objective, Echo Channel can also be used to test Kwirth connectivity and to monitor the status of objects in scope.

## Features
You can just configure two options prior to starting an Echo Channel:

  - **Max lines**, maximum number of lines to keep on screen; when the maximum is reached, old lines will start to disappear.
  - **Interval**, seconds to wait before sending the next echo from the backend to the frontend.

This is how the Echo setup looks:

![echosetup](../_media/ch-images/echo-setup.png ':class=imageclass40')

You can set your selected configuration as a default for future Echo Channel starting.

## Use
When you add an Echo Channel to your Kwirth desktop and start it (after configuring the echo interval), Kwirth will start sending information on added objects on a regular basis (your interval in seconds), as shown in the next figure.

![echo-running](../_media/ch-images/echo-running.png ':class=imageclass100')
